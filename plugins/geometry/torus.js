/*
 * SceneJS WebGL Scene Graph Library for JavaScript
 * http://scenejs.org/
 * Dual licensed under the MIT or GPL Version 2 licenses.
 * http://scenejs.org/license
 * Copyright 2010, Lindsay Kay
 *
 */
SceneJS.Plugins.addPlugin(

    "geometry", // Node type
    "torus",

    new (function () {

        this.getSource = function () {

            var created;
            var updated;
            var wasCreated = false;
            var configs = {};

            return {

                onCreate:function (fn) {
                    created = fn;
                },

                onUpdate:function (fn) {
                    updated = fn;
                },

                setConfigs:function (cfg) {
                    configs = cfg;
                    if (!wasCreated) {
                        created(buildTorus(cfg));
                        wasCreated = true;
                    } else {
                        updated(buildTorus(cfg));
                    }
                },

                getConfigs:function () {
                    return configs;
                },

                destroy:function () {
                }
            };
        };

        function buildTorus(cfg) {

            var radius = cfg.radius || 1;
            var tube = cfg.tube || 0.5;
            var segmentsR = cfg.segmentsR || 8;
            var segmentsT = cfg.segmentsT || 6;
            var arc = cfg.arc || Math.PI * 2;
            var coreId = "torus_" + radius + "_" + tube + "_" + segmentsR + "_" + segmentsT + "_" + arc;

            var positions = [];
            var normals = [];
            var uvs = [];
            var indices = [];

            var u;
            var v;
            var centerX;
            var centerY;
            var centerZ = 0;
            var x;
            var y;
            var z;
            var vec;

            for (var j = 0; j <= segmentsR; j++) {
                for (var i = 0; i <= segmentsT; i++) {

                    u = i / segmentsT * arc;
                    v = j / segmentsR * Math.PI * 2;

                    centerX = radius * Math.cos(u);
                    centerY = radius * Math.sin(u);

                    x = (radius + tube * Math.cos(v) ) * Math.cos(u);
                    y = (radius + tube * Math.cos(v) ) * Math.sin(u);
                    z = tube * Math.sin(v);

                    positions.push(x);
                    positions.push(y);
                    positions.push(z);

                    uvs.push(i / segmentsT);
                    uvs.push(1 - j / segmentsR);

                    vec = normalize(sub([x, y, z], [centerX, centerY, centerZ], []), []);

                    normals.push(vec[0]);
                    normals.push(vec[1]);
                    normals.push(vec[2]);
                }
            }

            var a;
            var b;
            var c;
            var d;

            for (var j = 1; j <= segmentsR; j++) {
                for (var i = 1; i <= segmentsT; i++) {

                    a = ( segmentsT + 1 ) * j + i - 1;
                    b = ( segmentsT + 1 ) * ( j - 1 ) + i - 1;
                    c = ( segmentsT + 1 ) * ( j - 1 ) + i;
                    d = ( segmentsT + 1 ) * j + i;

                    indices.push(a);
                    indices.push(b);
                    indices.push(c);
                    indices.push(c);
                    indices.push(d);
                    indices.push(a);
                }
            }

            return {
                primitive:"triangles",
                coreId:coreId,
                positions:new Float32Array(positions),
                normals:new Float32Array(normals),
                uv:new Float32Array(uvs),
                indices:new Uint16Array(indices)
            };
        }

        // Vector math functions

        function normalize(v, dest) {
            var f = 1.0 / len(v);
            return mul(v, f, dest);
        }

        function len(v) {
            return Math.sqrt(sqLen(v));
        }

        var sqLen = function (v) {
            return dot(v, v);
        };

        var dot = function (u, v) {
            return (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]);
        };

        function mul(v, s, dest) {
            dest[0] = v[0] * s;
            dest[1] = v[1] * s;
            dest[2] = v[2] * s;
            return dest;
        }

        function sub(u, v, dest) {
            dest[0] = u[0] - v[0];
            dest[1] = u[1] - v[1];
            dest[2] = u[2] - v[2];
            return dest;
        }
    })());
