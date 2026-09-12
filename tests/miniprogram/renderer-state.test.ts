import { describe, expect, it, vi } from 'vitest'
import { createVisionKitCameraRenderer } from '../../miniprogram/vision/visionkit-camera-renderer'

function sharedGL() {
  let activeTexture = 0
  const textures = new Map<number, unknown>([[5, 'vk-y'], [6, 'vk-uv']])
  const parameters: Record<string, any> = { CURRENT_PROGRAM: 'vk-program', FRAMEBUFFER_BINDING: 'vk-fbo', ARRAY_BUFFER_BINDING: 'vk-buffer', UNPACK_ALIGNMENT: 4, VIEWPORT: [2, 3, 4, 5], COLOR_WRITEMASK: [false, true, true, false], VERTEX_ARRAY_BINDING_OES: 'vk-vao' }
  const enabled = new Set(['BLEND', 'DEPTH_TEST', 'SCISSOR_TEST', 'CULL_FACE'])
  const gl: any = new Proxy({
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
    getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation: (_p: any, name: string) => name === 'a_position' ? 0 : 1,
    getUniformLocation: (_p: any, name: string) => name,
    getExtension: () => ({ VERTEX_ARRAY_BINDING_OES: 'VERTEX_ARRAY_BINDING_OES', createVertexArrayOES: () => 'camera-vao', bindVertexArrayOES: (vao: any) => { parameters.VERTEX_ARRAY_BINDING_OES = vao }, deleteVertexArrayOES: vi.fn() }),
    getParameter: (key: string) => key === 'ACTIVE_TEXTURE' ? activeTexture : key === 'TEXTURE_BINDING_2D' ? textures.get(activeTexture) : parameters[key],
    isEnabled: (key: string) => enabled.has(key), isContextLost: () => false,
    enable: (key: string) => enabled.add(key), disable: (key: string) => enabled.delete(key),
    activeTexture: (unit: number) => { activeTexture = unit },
    bindTexture: (_target: any, texture: any) => textures.set(activeTexture, texture),
    useProgram: (program: any) => { parameters.CURRENT_PROGRAM = program },
    bindFramebuffer: (_target: any, buffer: any) => { parameters.FRAMEBUFFER_BINDING = buffer },
    bindBuffer: (_target: any, buffer: any) => { parameters.ARRAY_BUFFER_BINDING = buffer },
    pixelStorei: (key: string, value: any) => { parameters[key] = value },
    viewport: (...args: number[]) => { parameters.VIEWPORT = args },
    colorMask: (...args: boolean[]) => { parameters.COLOR_WRITEMASK = args },
    drawArrays: vi.fn(() => {
      expect(parameters.FRAMEBUFFER_BINDING).toBeNull()
      expect(parameters.VERTEX_ARRAY_BINDING_OES).toBe('camera-vao')
      expect(enabled.has('BLEND')).toBe(false)
      expect(enabled.has('SCISSOR_TEST')).toBe(false)
      expect(parameters.COLOR_WRITEMASK).toEqual([true, true, true, true])
    }),
  }, { get: (target: any, key: string) => key in target ? target[key] : key === 'TEXTURE0' ? 0 : key.toUpperCase() === key ? key : vi.fn() })
  return { gl, parameters, textures, enabled }
}

describe('camera preview isolates shared VisionKit GL state', () => {
  it('restores SDK state even when drawing fails', () => {
    const { gl, parameters, textures, enabled } = sharedGL()
    const renderer = createVisionKitCameraRenderer({ width: 400, height: 800, getContext: () => gl })
    gl.drawArrays.mockImplementation(() => { throw new Error('native draw failed') })
    expect(() => renderer.render({ getCameraTexture: () => ({ yTexture: 'camera-y', uvTexture: 'camera-uv' }), getDisplayTransform: () => [1, 0, 0, 0, 1, 0, 0, 0, 1] })).toThrow('native draw failed')
    expect(parameters.CURRENT_PROGRAM).toBe('vk-program')
    expect(parameters.FRAMEBUFFER_BINDING).toBe('vk-fbo')
    expect(parameters.VERTEX_ARRAY_BINDING_OES).toBe('vk-vao')
    expect(textures.get(5)).toBe('vk-y')
    expect(textures.get(6)).toBe('vk-uv')
    expect(enabled.has('BLEND')).toBe(true)
  })
  it('draws to the visible canvas without blending and restores the SDK bindings', () => {
    const { gl, parameters, textures, enabled } = sharedGL()
    const renderer = createVisionKitCameraRenderer({ width: 400, height: 800, getContext: () => gl })
    gl.useProgram('vk-program'); gl.bindBuffer(gl.ARRAY_BUFFER, 'vk-buffer')
    renderer.render({ getCameraTexture: () => ({ yTexture: 'camera-y', uvTexture: 'camera-uv' }), getDisplayTransform: () => [1, 0, 0, 0, 1, 0, 0, 0, 1] })
    expect(parameters.CURRENT_PROGRAM).toBe('vk-program')
    expect(parameters.FRAMEBUFFER_BINDING).toBe('vk-fbo')
    expect(parameters.VERTEX_ARRAY_BINDING_OES).toBe('vk-vao')
    expect(parameters.VIEWPORT).toEqual([2, 3, 4, 5])
    expect(textures.get(5)).toBe('vk-y')
    expect(textures.get(6)).toBe('vk-uv')
    expect(enabled.has('BLEND')).toBe(true)
    expect(gl.drawArrays).toHaveBeenCalledOnce()
  })
})
