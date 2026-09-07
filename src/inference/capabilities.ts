import { Schema as S } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

export const GpuStatus = defineTaggedUnion({
  Checking: {},
  Available: { adapterName: S.String, shaderF16: S.Boolean },
  Unavailable: { reason: S.String },
})
export type GpuStatus = typeof GpuStatus.Type

export const checkGpu = async (): Promise<GpuStatus> => {
  if (!navigator.gpu) {
    return GpuStatus.Unavailable({
      reason:
        'WebGPU is not exposed by this browser. Try a supported browser on HTTPS or localhost.',
    })
  }
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) {
    return GpuStatus.Unavailable({
      reason: 'The browser could not provide a WebGPU adapter.',
    })
  }
  const info = adapter.info
  return GpuStatus.Available({
    adapterName:
      info.description ||
      [info.vendor, info.architecture].filter(Boolean).join(' ') ||
      'WebGPU adapter',
    shaderF16: adapter.features.has('shader-f16'),
  })
}
