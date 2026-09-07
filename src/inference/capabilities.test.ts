import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkGpu } from './capabilities'

afterEach(() => vi.unstubAllGlobals())

describe('WebGPU detection', () => {
  it('reports a browser without WebGPU', async () => {
    vi.stubGlobal('navigator', {})
    expect(await checkGpu()).toMatchObject({ _tag: 'Unavailable' })
  })
  it('does not mistake API presence for an available adapter', async () => {
    vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => null } })
    expect(await checkGpu()).toMatchObject({ _tag: 'Unavailable' })
  })
  it('reports the adapter and its actual half-precision support', async () => {
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: async () => ({
          info: { description: 'Test GPU', vendor: '', architecture: '' },
          features: new Set(['shader-f16']),
        }),
      },
    })
    expect(await checkGpu()).toEqual({
      _tag: 'Available',
      adapterName: 'Test GPU',
      shaderF16: true,
    })
  })
})
