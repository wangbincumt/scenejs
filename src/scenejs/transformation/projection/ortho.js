/**
 * Scene node that constructs an ortographic projection matrix and sets it on the current shader.
 */
SceneJS.ortho = function() {
    var cfg = SceneJS._utils.getNodeConfig(arguments);
    var backend = SceneJS._backends.getBackend('projection');
    var transform;
    return SceneJS._utils.createNode(
            function(traversalContext, data) {
                if (!transform || !cfg.fixed) {
                    var params = cfg.getParams(data);
                    var volume = {
                        left: params.left || -1.0,
                        right: params.right || 1.0,
                        bottom: params.bottom || -1.0,
                        top: params.top || 1.0,
                        near: params.near || 0.1,
                        far: params.far || 100.0
                    };
                    var tempMat = SceneJS._math.orthoMat4c(
                            volume.left,
                            volume.right,
                            volume.bottom,
                            volume.top,
                            volume.near,
                            volume.far
                            );
                    transform = {
                        matrix: tempMat
                    };
                }
                var prevTransform = backend.getTransform();
                backend.setTransform(transform);
                SceneJS._utils.visitChildren(cfg, traversalContext, data);
                backend.setTransform(prevTransform);
            });
};
