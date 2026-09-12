import type { VisionKitFrame, VisionKitFrameRenderer } from './visionkit-hand-session';

export type VisionKitWebGLCanvas = {
  width: number;
  height: number;
  getContext(type: 'webgl', attributes?: { preserveDrawingBuffer?: boolean }): any;
};

type CameraFrame = {
  getCameraTexture(gl: any, format: 'yuv'): { yTexture?: any; uvTexture?: any };
  getDisplayTransform(): Float32Array | number[];
};

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  uniform mat3 displayTransform;
  varying vec2 v_texCoord;
  void main() {
    vec3 point = displayTransform * vec3(a_position, 0.0);
    gl_Position = vec4(point, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  uniform sampler2D y_texture;
  uniform sampler2D uv_texture;
  varying vec2 v_texCoord;
  void main() {
    vec4 yColor = texture2D(y_texture, v_texCoord);
    vec4 uvColor = texture2D(uv_texture, v_texCoord);
    float y = yColor.r;
    float u = uvColor.r - 0.5;
    float v = uvColor.a - 0.5;
    gl_FragColor = vec4(
      y + 1.402 * v,
      y - 0.344 * u - 0.714 * v,
      y + 1.772 * u,
      1.0
    );
  }
`;

/**
 * YUV camera renderer adapted from Tencent's MIT-licensed VisionKit demo.
 * Source: https://github.com/wechat-miniprogram/miniprogram-demo/blob/master/miniprogram/packageAPI/pages/ar/hand-detect/yuvBehavior.js
 */
export function createVisionKitCameraRenderer(
  canvas: VisionKitWebGLCanvas,
): VisionKitFrameRenderer {
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) throw new Error('VisionKit requires a WebGL canvas');

  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  const positionBuffer = createBuffer(gl, [1, 1, -1, 1, 1, -1, -1, -1]);
  const texCoordBuffer = createBuffer(gl, [1, 1, 0, 1, 1, 0, 0, 0]);
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
  const transformLocation = gl.getUniformLocation(program, 'displayTransform');
  const yLocation = gl.getUniformLocation(program, 'y_texture');
  const uvLocation = gl.getUniformLocation(program, 'uv_texture');
  const vaoExtension = gl.getExtension('OES_vertex_array_object');
  const cameraVao = vaoExtension?.createVertexArrayOES();

  const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM);
  gl.useProgram(program);
  gl.uniform1i(yLocation, 5);
  gl.uniform1i(uvLocation, 6);
  gl.useProgram(previousProgram);

  let disposed = false;

  return {
    gl,
    render(frame: VisionKitFrame) {
      if (disposed) return;
      if (gl.isContextLost()) throw new Error('VisionKit WebGL context lost; restart camera');
      const cameraFrame = frame as CameraFrame;
      const { yTexture, uvTexture } = cameraFrame.getCameraTexture(gl, 'yuv');
      if (!yTexture || !uvTexture) return;

      // VK and the preview share a context. Never inherit an offscreen FBO,
      // blending or clipped/color-masked drawing left by a previous VK frame.
      // Texture/program restoration follows Tencent's yuvBehavior.js above.
      const savedProgram = gl.getParameter(gl.CURRENT_PROGRAM);
      const savedActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
      const savedFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      const savedBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      const savedVao = cameraVao ? gl.getParameter(vaoExtension.VERTEX_ARRAY_BINDING_OES) : null;
      const savedAlignment = gl.getParameter(gl.UNPACK_ALIGNMENT);
      const savedViewport = gl.getParameter(gl.VIEWPORT);
      const savedColorMask = gl.getParameter(gl.COLOR_WRITEMASK);
      const capabilities = [gl.DEPTH_TEST, gl.BLEND, gl.SCISSOR_TEST, gl.CULL_FACE];
      const savedEnabled = capabilities.map(capability => gl.isEnabled(capability));
      gl.activeTexture(gl.TEXTURE0 + 5);
      const savedY = gl.getParameter(gl.TEXTURE_BINDING_2D);
      gl.activeTexture(gl.TEXTURE0 + 6);
      const savedUV = gl.getParameter(gl.TEXTURE_BINDING_2D);
      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        capabilities.forEach(capability => gl.disable(capability));
        gl.colorMask(true, true, true, true);
        gl.useProgram(program);
        gl.uniform1i(yLocation, 5);
        gl.uniform1i(uvLocation, 6);
        if (cameraVao) vaoExtension.bindVertexArrayOES(cameraVao);
        bindAttribute(gl, positionBuffer, positionLocation);
        bindAttribute(gl, texCoordBuffer, texCoordLocation);
        gl.uniformMatrix3fv(transformLocation, false, cameraFrame.getDisplayTransform());
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        bindTexture(gl, 5, yTexture);
        bindTexture(gl, 6, uvTexture);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } finally {
        bindTexture(gl, 5, savedY);
        bindTexture(gl, 6, savedUV);
        gl.activeTexture(savedActiveTexture);
        gl.useProgram(savedProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, savedFramebuffer);
        if (cameraVao) vaoExtension.bindVertexArrayOES(savedVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, savedBuffer);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, savedAlignment);
        gl.viewport(...savedViewport);
        gl.colorMask(...savedColorMask);
        capabilities.forEach((capability, index) => savedEnabled[index] ? gl.enable(capability) : gl.disable(capability));
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (cameraVao) vaoExtension.deleteVertexArrayOES(cameraVao);
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(texCoordBuffer);
      gl.deleteProgram(program);
    },
  };
}

function createProgram(gl: any, vertexSource: string, fragmentSource: string): any {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create VisionKit WebGL program');

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'unknown link error';
    gl.deleteProgram(program);
    throw new Error(`VisionKit WebGL link failed: ${message}`);
  }
  return program;
}

function compileShader(gl: any, type: number, source: string): any {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create VisionKit WebGL shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'unknown compile error';
    gl.deleteShader(shader);
    throw new Error(`VisionKit WebGL shader failed: ${message}`);
  }
  return shader;
}

function createBuffer(gl: any, values: number[]): any {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('Unable to create VisionKit WebGL buffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
  return buffer;
}

function bindAttribute(gl: any, buffer: any, location: number): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(location);
}

function bindTexture(gl: any, unit: number, texture: any): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}
