/**
 * This backend encapsulates shading behind an event API.
 *
 * By listening to XXX_UPDATED events, this backend tracks various elements of scene state, such as WebGL settings,
 * texture layers, lighting, current material properties etc.
 *
 * On a SHADER_ACTIVATE event it will compose and activate a shader taylored to the current scene state
 * (ie. where the shader has variables and routines for the current lights, materials etc), then fire a
 * SHADER_ACTIVATED event when the shader is ready for business.
 *
 * Other backends will then handle the SHADER_ACTIVATED event by firing XXXXX_EXPORTED events parameterised with
 * resources that they want loaded into the shader. This backend then handles those by loading their parameters into
 * the shader.
 *
 * The backend will avoid constant re-generation of shaders by caching each of them against a hash code that it
 * derives from the current collective scene state; on a SHADER_ACTIVATE event, it will attempt to reuse a shader
 * cached for the hash of the current scene state.
 *
 * Shader allocation and LRU cache eviction is mediated by the "memory" backend.
 */
SceneJS._backends.installBackend(

        "shader",

        function(ctx) {

            var time = (new Date()).getTime();      // For LRU caching
            var canvas;                             // Currently active canvas
            var rendererState;                      // WebGL settings state
            var programs = {};                      // Program cache
            var activeProgram = null;               // Currently active program
            var lights = [];                        // Current lighting state
            var material = {};                      // Current material state
            var fog = null;                         // Current fog
            var textureLayers = [];                 // Texture layers are pushed/popped to this as they occur
            var sceneHash;                          // Current hash of collective scene state pertenant to shaders

            ctx.events.onEvent(
                    SceneJS._eventTypes.TIME_UPDATED,
                    function(t) {
                        time = t;
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.RESET,
                    function() {
                        for (var programId in programs) {  // Just free allocated programs
                            programs[programId].destroy();
                        }
                        programs = {};
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.SCENE_ACTIVATED,
                    function() {
                        canvas = null;
                        rendererState = null;
                        activeProgram = null;
                        lights = [];
                        material = {};
                        textureLayers = [];
                        sceneHash = null;
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.CANVAS_ACTIVATED,
                    function(c) {
                        canvas = c;
                        activeProgram = null;
                        sceneHash = null;
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.CANVAS_DEACTIVATED,
                    function() {
                        canvas = null;
                        activeProgram = null;
                        sceneHash = null;
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.NAME_EXPORTED,
                    function(item) {
                        activeProgram.setUniform("uColor", item.color);
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.RENDERER_UPDATED,
                    function(_rendererState) {
                        rendererState = _rendererState;  // Canvas change will be signified by a CANVAS_UPDATED
                        sceneHash = null;
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.RENDERER_EXPORTED,
                    function(_rendererState) {

                        /* Default ambient material colour is taken from canvas clear colour
                         */
                        var clearColor = _rendererState.clearColor;
                        activeProgram.setUniform("uAmbient",
                                clearColor
                                        ? [clearColor.r, clearColor.g, clearColor.b]
                                        : [0, 0, 0]);
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.TEXTURES_UPDATED,
                    function(stack) {
                        textureLayers = stack;
                        sceneHash = null;
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.TEXTURES_EXPORTED,
                    function(stack) {
                        for (var i = 0; i < stack.length; i++) {
                            var layer = stack[i];
                            activeProgram.bindTexture("uSampler" + i, layer.texture, i);
                            if (layer.params.matrixAsArray) {
                                activeProgram.setUniform("uLayer" + i + "Matrix", layer.params.matrixAsArray);
                            }
                        }
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.LIGHTS_UPDATED,
                    function(l) {
                        lights = l;
                        sceneHash = null;
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.LIGHTS_EXPORTED,
                    function(_lights) {
                        for (var i = 0; i < _lights.length; i++) {
                            var light = _lights[i];

                            activeProgram.setUniform("uLightColor" + i, light.color);
                            activeProgram.setUniform("uLightDiffuse" + i, light.diffuse);

                            if (light.type == "dir") {
                                activeProgram.setUniform("uLightDir" + i, light.dir);
                            }
                            if (light.type == "point") {
                                activeProgram.setUniform("uLightPos" + i, light.pos);
                            }
                            if (light.type == "spot") {
                                activeProgram.setUniform("uLightSpotDir" + i, light.spotDir);
                                activeProgram.setUniform("uLightSpotCosCutOff" + i, light.spotCosCutOff);
                                activeProgram.setUniform("uLightSpotExp" + i, light.spotExponent);
                            }

                            activeProgram.setUniform("uLightAttenuation" + i,
                                    [
                                        light.constantAttenuation,
                                        light.linearAttenuation,
                                        light.quadraticAttenuation
                                    ]);
                        }
                    });


            ctx.events.onEvent(
                    SceneJS._eventTypes.MATERIAL_UPDATED,
                    function(m) {
                        material = m;
                        sceneHash = null;
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.MATERIAL_EXPORTED,
                    function(m) {
                        activeProgram.setUniform("uMaterialBaseColor", m.baseColor);
                        activeProgram.setUniform("uMaterialSpecularColor", m.specularColor);

                        activeProgram.setUniform("uMaterialSpecular", m.specular);
                        activeProgram.setUniform("uMaterialShine", m.shine);
                        activeProgram.setUniform("uMaterialEmit", m.emit);
                        activeProgram.setUniform("uMaterialAlpha", m.alpha);
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.FOG_UPDATED,
                    function(f) {
                        fog = f;
                        sceneHash = null;
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.FOG_EXPORTED,
                    function(f) {
                        activeProgram.setUniform("uFogColor", f.color);
                        activeProgram.setUniform("uFogDensity", f.density);
                        activeProgram.setUniform("uFogStart", f.start);
                        activeProgram.setUniform("uFogEnd", f.end);
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.MODEL_TRANSFORM_EXPORTED,
                    function(transform) {
                        activeProgram.setUniform("uMMatrix", transform.matrixAsArray);
                        activeProgram.setUniform("uMNMatrix", transform.normalMatrixAsArray);
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.VIEW_TRANSFORM_EXPORTED,
                    function(transform) {
                        activeProgram.setUniform("uVMatrix", transform.matrixAsArray);
                        activeProgram.setUniform("uVNMatrix", transform.normalMatrixAsArray);
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.PROJECTION_TRANSFORM_EXPORTED,
                    function(transform) {
                        activeProgram.setUniform("uPMatrix", transform.matrixAsArray);
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.GEOMETRY_EXPORTED,
                    function(geo) {
                        activeProgram.bindFloatArrayBuffer("aVertex", geo.vertexBuf);
                        activeProgram.bindFloatArrayBuffer("aNormal", geo.normalBuf);
                        if (geo.texCoordBuf && textureLayers.length > 0 && rendererState.enableTexture2D) {
                            activeProgram.bindFloatArrayBuffer("aTextureCoord", geo.texCoordBuf);
                        }
                    });

            ctx.events.onEvent(
                    SceneJS._eventTypes.SHADER_ACTIVATE, // Request to activate a shader
                    function() {
                        activateProgram();
                    });

            ctx.memory.registerEvictor(
                    function() {
                        var earliest = time;
                        var programToEvict;
                        for (var hash in programs) {
                            if (hash) {
                                var program = programs[hash];

                                /* Avoiding eviction of shader just used,
                                 * currently in use, or likely about to use
                                 */
                                if (program.lastUsed < earliest && program.hash != sceneHash) {
                                    programToEvict = program;
                                    earliest = programToEvict.lastUsed;
                                }
                            }
                        }
                        if (programToEvict) { // Delete LRU program's shaders and deregister program
                            ctx.logging.info("Evicting shader: " + hash);
                            programToEvict.destroy();
                            programs[programToEvict.hash] = null;
                            return true;
                        }
                        return false;   // Couldnt find suitable program to delete
                    });

            function activateProgram() {
                if (!canvas) {
                    throw new SceneJS.exceptions.NoCanvasActiveException("No canvas active");
                }

                if (!sceneHash) {
                    generateHash();
                }

                if (!activeProgram || activeProgram.hash != sceneHash) {
                    if (activeProgram) {
                        canvas.context.flush();
                        activeProgram.unbind();
                        activeProgram = null;
                        ctx.events.fireEvent(SceneJS._eventTypes.SHADER_DEACTIVATED);
                    }

                    if (!programs[sceneHash]) {
                        ctx.logging.info("Creating shader: '" + sceneHash + "'");
                        var vertexShaderSrc = composeVertexShader();
                        var fragmentShaderSrc = composeFragmentShader();
                        ctx.memory.allocate(
                                "shader",
                                function() {
                                    try {
                                        programs[sceneHash] = new SceneJS._webgl.Program(
                                                sceneHash,
                                                time,
                                                canvas.context,
                                                [vertexShaderSrc],
                                                [fragmentShaderSrc],
                                                ctx.logging);
                                    } catch (e) {
                                        ctx.logging.debug("Vertex shader:");
                                        ctx.logging.debug(getShaderLoggingSource(vertexShaderSrc.split(";")));
                                        ctx.logging.debug("Fragment shader:");
                                        ctx.logging.debug(getShaderLoggingSource(fragmentShaderSrc.split(";")));
                                        throw e;
                                    }
                                });
                    }
                    activeProgram = programs[sceneHash];
                    activeProgram.lastUsed = time;
                    activeProgram.bind();
                    ctx.events.fireEvent(SceneJS._eventTypes.SHADER_ACTIVATED);
                }

                ctx.events.fireEvent(SceneJS._eventTypes.SHADER_RENDERING);
            }

            /** Generates a shader hash code from current rendering state.
             */
            function generateHash() {
                var val = [
                    canvas.canvasId,
                    ";"
                ];

                if (SceneJS._utils.traversalMode == SceneJS._utils.TRAVERSAL_MODE_PICKING) {

                    /* Trivial hash for picking mode shader
                     */
                    val.push("picking;");
                } else {

                    /* Complex hash for rendering mode shader
                     */

                    /* Textures
                     */
                    if (textureLayers.length > 0) {
                        val.push("tex/");
                        for (var i = 0; i < textureLayers.length; i++) {
                            var layer = textureLayers[i];
                            val.push(layer.params.applyFrom);
                            val.push("/");
                            val.push(layer.params.applyTo);
                            val.push("/");
                            val.push(layer.params.blendMode);
                            val.push("/");
                            if (layer.params.matrix) {
                                val.push("/anim");
                            }
                        }
                        val.push(";");
                    }

                    /* Lighting
                     */
                    if (lights.length > 0) {
                        val.push("light/");
                        for (var i = 0; i < lights.length; i++) {
                            var light = lights[i];
                            val.push(light.type);
                            val.push("/");
                            if (light.specular) {
                                val.push("spec/");
                            }
                            if (light.diffuse) {
                                val.push("diff/");
                            }
                        }
                        val.push(";");
                    }

                    /* Fog
                     */
                    if (fog && fog.mode != "disabled") {
                        val.push("fog/");
                        val.push(fog.mode);
                        val.push(";");
                    }
                }
                sceneHash = val.join("");
            }

            function getShaderLoggingSource(src) {
                var src2 = [];
                for (var i = 0; i < src.length; i++) {
                    var padding = (i < 10) ? "&nbsp;&nbsp;&nbsp;" : ((i < 100) ? "&nbsp;&nbsp;" : (i < 1000 ? "&nbsp;" : ""));
                    src2.push(i + padding + ": " + src[i]);
                }
                return src2.join("<br/>");
            }

            function composeVertexShader() {
                return SceneJS._utils.traversalMode == SceneJS._utils.TRAVERSAL_MODE_RENDER ?
                       composeRenderingVertexShader() : composePickingVertexShader();
            }

            function composeFragmentShader() {
                return SceneJS._utils.traversalMode == SceneJS._utils.TRAVERSAL_MODE_RENDER ?
                       composeRenderingFragmentShader() : composePickingFragmentShader();
            }

            /**
             * Composes a vertex shader script for rendering mode in current scene state
             */
            function composePickingVertexShader() {
                return [
                    "attribute vec3 aVertex;",
                    "uniform mat4 uMMatrix;",
                    "uniform mat4 uVMatrix;",
                    "uniform mat4 uPMatrix;",
                    "void main(void) {",
                    "  gl_Position = uPMatrix * (uVMatrix * (uMMatrix * vec4(aVertex, 1.0)));",
                    "}"
                ].join("\n");
            }

            /**
             * Composes a fragment shader script for rendering mode in current scene state
             */
            function composePickingFragmentShader() {
                var g = parseFloat(Math.round((10 + 1) / 256) / 256);
                var r = parseFloat((10 - g * 256 + 1) / 256);
                var src = [
                    "uniform vec3 uColor;",
                    "void main(void) {",

                    "gl_FragColor = vec4(" + (r.toFixed(17)) + ", " + (g.toFixed(17)) + ",1.0,1.0);",

                    //      "    gl_FragColor = vec4(uColor.rgb, 1.0);  ",
                    "}"
                ].join("\n");

                return src;
            }

            /**
             * Composes a vertex shader script for rendering mode in current scene state
             *
             *      Vertex in view-space
             *      Normal in view-space
             *      Direction of each light position from view-space vertex
             *      Direction of vertex from eye position
             */
            function composeRenderingVertexShader() {

                var haveTextures = textureLayers.length > 0 && rendererState.enableTexture2D;

                var src = ["\n"];
                src.push("attribute vec3 aVertex;");                // World
                src.push("attribute vec3 aNormal;");                // World
                if (haveTextures) {
                    src.push("attribute vec2 aTextureCoord;");      // World
                }
                src.push("uniform mat4 uMMatrix;");               // Model
                src.push("uniform mat4 uMNMatrix;");              // Model Normal
                src.push("uniform mat4 uVMatrix;");               // View
                src.push("uniform mat4 uVNMatrix;");              // View Normal
                src.push("uniform mat4 uPMatrix;");               // Projection

                for (var i = 0; i < lights.length; i++) {
                    var light = lights[i];
                    if (light.type == "dir") {
                        src.push("uniform vec3 uLightDir" + i + ";");
                    }
                    if (light.type == "point") {
                        src.push("uniform vec3 uLightPos" + i + ";");
                    }
                    if (light.type == "spot") {
                        src.push("uniform vec3 uLightPos" + i + ";");
                    }
                }
                src.push("varying vec4 vViewVertex;");
                src.push("varying vec3 vNormal;");
                src.push("varying vec3 vEyeVec;");
                if (haveTextures) {
                    src.push("varying vec2 vTextureCoord;");
                }

                for (var i = 0; i < lights.length; i++) {
                    src.push("varying vec3 vLightVec" + i + ";");
                    src.push("varying float vLightDist" + i + ";");
                }
                src.push("void main(void) {");
                src.push("  vec4 tmpVNormal = uVNMatrix * (uMNMatrix * vec4(aNormal, 1.0)); ");
                src.push("  vNormal = normalize(tmpVNormal.xyz);");                                 // View-space normal
                src.push("  vec4 tmpVertex = uVMatrix * (uMMatrix * vec4(aVertex, 1.0)); ");
                src.push("  vViewVertex = tmpVertex;");
                src.push("  gl_Position = uPMatrix * vViewVertex;");

                src.push("  vec3 tmpVec;");
                for (var i = 0; i < lights.length; i++) {
                    var light = lights[i];
                    if (light.type == "dir") {
                        src.push("tmpVec = -uLightDir" + i + ";");
                    }
                    if (light.type == "point") {
                        src.push("tmpVec = -(uLightPos" + i + ".xyz - tmpVertex.xyz);");
                        src.push("vLightDist" + i + " = length(tmpVec);");          // Distance from light to vertex
                    }
                    src.push("vLightVec" + i + " = tmpVec;");                   // Vector from light to vertex

                }
                src.push("vEyeVec = normalize(-vViewVertex.xyz);");
                if (haveTextures) {
                    src.push("vTextureCoord = aTextureCoord;");
                }
                src.push("}");
                ctx.logging.info(getShaderLoggingSource(src));
                return src.join("\n");
            }


            /**
             * Generates a fragment shader script for rendering mode in current scene state
             */
            function composeRenderingFragmentShader() {

                var haveTextures = textureLayers.length > 0 && rendererState.enableTexture2D;
                var haveLights = (lights.length > 0);
                var tangent = false;

                var src = ["\n"];

                // ------------ Inputs ----------------------------------------------

                src.push("varying vec4 vViewVertex;");              // View-space vertex
                src.push("varying vec3 vNormal;");                  // View-space normal
                src.push("varying vec3 vEyeVec;");                  // Direction of view-space vertex from eye

                if (haveTextures) {
                    src.push("varying vec2 vTextureCoord;");

                    //texture uniforms
                    for (var i = 0; i < textureLayers.length; i++) {
                        var layer = textureLayers[i];
                        src.push("uniform sampler2D uSampler" + i + ";");
                        if (layer.params.matrix) {
                            src.push("uniform mat4 uLayer" + i + "Matrix;");
                        }
                    }
                }

                src.push("uniform vec3 uAmbient;");                         // Scene ambient colour - taken from clear colour

                /* Light-independent material uniforms
                 */
                src.push("uniform vec4 uMaterialBaseColor;");
                src.push("uniform float uMaterialEmit;");
                src.push("uniform float uMaterialAlpha;");

                /* Light and lighting-dependent material uniforms
                 */
                if (haveLights) {

                    src.push("uniform vec3  uMaterialSpecularColor;");
                    src.push("uniform float uMaterialSpecular;");
                    src.push("uniform float uMaterialShine;");

                    for (var i = 0; i < lights.length; i++) {
                        var light = lights[i];

                        src.push("uniform vec3  uLightColor" + i + ";");
                        src.push("uniform vec3  uLightPos" + i + ";");
                        src.push("uniform vec3  uLightSpotDir" + i + ";");

                        if (light.type == "spot") {
                            src.push("uniform float  uLightSpotCosCutOff" + i + ";");
                            src.push("uniform float  uLightSpotExp" + i + ";");
                        }

                        src.push("uniform vec3  uLightAttenuation" + i + ";");

                        // Computed by vertex shader:

                        src.push("varying vec3   vLightVec" + i + ";");         // Vector from light to vertex
                        src.push("varying float  vLightDist" + i + ";");        // Distance from light to vertex
                    }
                }

                /* Fog uniforms
                 */
                if (fog && fog.mode != "disabled") {
                    src.push("uniform vec3  uFogColor;");
                    src.push("uniform float uFogDensity;");
                    src.push("uniform float uFogStart;");
                    src.push("uniform float uFogEnd;");
                }

                src.push("void main(void) {");

                src.push("  vec3    ambientValue=uAmbient;");

                /* Initial values for colours and coefficients that will be modulated by
                 * by the application of texture layers and lighting
                 */
                src.push("  vec4    color   = uMaterialBaseColor;");
                src.push("  float   emit    = uMaterialEmit;");
                src.push("  float   alpha   = uMaterialAlpha;");

                src.push("  vec4    normalmap = vec4(vNormal,0.0);");

                if (haveLights) {
                    src.push("  float   specular=uMaterialSpecular;");
                    src.push("  vec3    specularColor=uMaterialSpecularColor;");
                    src.push("  float   shine=uMaterialShine;");


                    src.push("  float   attenuation = 1.0;");
                }

                src.push("  float   mask=1.0;");

                src.push("  vec4    texturePos;");
                src.push("  vec2    textureCoord=vec2(0.0,0.0);");

                /* ====================================================================================================
                 * TEXTURING
                 * ===================================================================================================*/

                if (haveTextures) {

                    /* Get texturePos from image
                     */

                    for (var i = 0; i < textureLayers.length; i++) {
                        var layer = textureLayers[i];

                        /* Get texture coord from specified source
                         */
                        if (layer.params.applyFrom == "normal") {
                            src.push("texturePos=vec4(vNormal.xyz, 1.0);");
                        }

                        if (layer.params.applyFrom == "geometry") {
                            src.push("texturePos = vec4(vTextureCoord.s, vTextureCoord.t, 1.0, 1.0);");
                        }

                        /* Transform texture coord
                         */
                        if (layer.params.matrixAsArray) {
                            src.push("textureCoord=(uLayer" + i + "Matrix * texturePos).xy;");
                        } else {
                            src.push("textureCoord=texturePos.xy;");
                        }

                        /* Apply the layer
                         */

                        if (layer.params.applyTo == "baseColor") {
                            if (layer.params.blendMode == "multiply") {
                                src.push("color  = color * texture2D(uSampler" + i + ", vec2(textureCoord.x, 1.0 - textureCoord.y));");
                            } else {
                                src.push("color  = color + texture2D(uSampler" + i + ", vec2(textureCoord.x, 1.0 - textureCoord.y));");
                            }
                        }
                    }

                }
                /* ====================================================================================================
                 * LIGHTING
                 * ===================================================================================================*/

                src.push("  vec3    lightValue      = uAmbient;");
                src.push("  vec3    specularValue   = vec3(0.0,0.0,0.0);");

                if (haveLights) {
                    src.push("  vec3    lightVec;");
                    src.push("  float   dotN;");
                    src.push("  float   spotFactor;");
                    src.push("  float   pf;");

                    for (var i = 0; i < lights.length; i++) {
                        var light = lights[i];
                        src.push("lightVec = normalize(vLightVec" + i + ");");

                        /* Point Light
                         */
                        if (light.type == "point") {
                            src.push("dotN = max(dot(vNormal,lightVec),0.0);");

                            src.push("if (dotN > 0.0) {");

                            src.push("  attenuation = 1.0 / (" +
                                     "  uLightAttenuation" + i + "[0] + " +
                                     "  uLightAttenuation" + i + "[1] * vLightDist" + i + " + " +
                                     "  uLightAttenuation" + i + "[2] * vLightDist" + i + " * vLightDist" + i + ");");

                            if (light.diffuse) {
                                src.push("  lightValue += dotN *  uLightColor" + i + " * attenuation;");
                            }

                            if (light.specular) {
                                src.push("specularValue += attenuation * specularColor * uLightColor" + i +
                                         " * specular  * pow(max(dot(reflect(-lightVec, vNormal), vEyeVec),0.0), shine);");
                            }
                            src.push("}");
                        }

                        /* Directional Light
                         */
                        if (light.type == "dir") {
                            src.push("dotN = max(dot(vNormal,lightVec),0.0);");
                            if (light.diffuse) {
                                src.push("lightValue += dotN * uLightColor" + i + ";");
                            }
                            if (light.specular) {
                                src.push("specularValue += specularColor * uLightColor" + i +
                                         " * specular  * pow(max(dot(reflect(lightVec, vNormal),normalize(vEyeVec)),0.0), shine);");
                            }
                        }


                        /* Spot light
                         */
                        if (light.type == "spot") {
                            src.push("spotFactor = dot(-lightVec,-normalize(uLightSpotDir" + i + "));");
                            src.push("if (spotFactor > uLightSpotCosCutOff" + i + ") {");
                            src.push("  spotFactor = pow(spotFactor, uLightSpotExp" + i + ");");

                            src.push("  dotN = max(dot(vNormal,-normalize(lightVec)),0.0);");

                            src.push("      if(dotN>0.0){");

                            src.push("          attenuation = spotFactor / (" +
                                     "uLightAttenuation" + i + "[0] + " +
                                     "uLightAttenuation" + i + "[1] * vLightDist" + i + " + " +
                                     "uLightAttenuation" + i + "[2] * vLightDist" + i + " * vLightDist" + i + ");\n");

                            if (light.diffuse) {
                                src.push("lightValue += dotN * uLightColor" + i + ";");
                            }
                            if (lights[i].specular) {
                                src.push("specularValue += specularColor * uLightColor" + i +
                                         " * specular  * pow(max(dot(reflect(normalize(lightVec), vNormal),normalize(vEyeVec)),0.0), shine);");
                            }

                            src.push("      }");
                            src.push("}");
                        }
                    }
                }

                src.push("if (emit>0.0) lightValue = vec3(1.0, 1.0, 1.0);");

                src.push("vec4 fragColor = vec4(specularValue.rgb + color.rgb * (emit+1.0) * lightValue.rgb, alpha);");

                if (fog && fog.mode != "disabled") {
                    src.push("float fogFact=1.0;");
                    if (fog.mode == "exp") {
                        src.push("fogFact=clamp(pow(max((uFogEnd - length(-vViewVertex.xyz)) / (uFogEnd - uFogStart), 0.0), 2.0), 0.0, 1.0);");
                    } else if (fog.mode == "linear") {
                        src.push("fogFact=clamp((uFogEnd - length(-vViewVertex.xyz)) / (uFogEnd - uFogStart), 0.0, 1.0);");
                    }
                    src.push("gl_FragColor = fragColor * fogFact + vec4(uFogColor, 1) * (1.0 - fogFact);");
                } else {
                    src.push("gl_FragColor = fragColor;");
                }
                src.push("}");

                ctx.logging.info(getShaderLoggingSource(src));
                return src.join("\n");
            }
        });
