import type { HtmlBuilder } from 'foldkit/html'

import { GpuStatus } from '../inference/capabilities'

export const runtimeDetailsView = <Message>(
  config: { gpu: GpuStatus; phase: string },
  h: HtmlBuilder<Message>,
) =>
  h.span(
    [h.Class('runtime-details'), h.AriaLabel('Local runtime status')],
    [
      ...GpuStatus.match(config.gpu, {
        Checking: () => [],
        Available: ({ adapterName, shaderF16 }) => [
          h.span([], ['WebGPU available']),
          h.span([], [`GPU: ${adapterName}`]),
          h.span(
            [],
            [
              shaderF16
                ? 'FP16 supported'
                : 'FP16 unavailable; this model may not load',
            ],
          ),
        ],
        Unavailable: ({ reason }) => [
          h.span([], [`WebGPU unavailable · ${reason}`]),
        ],
      }),
      h.span([], ['Precision: Q4F16']),
      h.span([], ['Runs on your device']),
      config.phase ? h.span([h.AriaLive('polite')], [config.phase]) : h.empty,
    ],
  )
