import { Array } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'

import {
  type Component,
  type DownloadState,
  componentProgress,
} from './progress'
import { RollingNumber } from './rolling-number'

export const PARAMETERS_PER_DOT = 1_000_000
export const blocks: ReadonlyArray<{
  id: string
  name: string
  detail: string
  millions: number
  component: Component
  x: number
  y: number
  width: number
  height: number
  columns: number
}> = [
  {
    id: 'tokens',
    name: 'Token embeddings',
    detail: '262,144 tokens · 1,536 dimensions',
    millions: 400,
    component: 'embed_tokens',
    x: 20,
    y: 72,
    width: 320,
    height: 144,
    columns: 70,
  },
  {
    id: 'ple',
    name: 'PLE table',
    detail: '262,144 × (35 × 256)',
    millions: 2340,
    component: 'embed_tokens',
    x: 20,
    y: 410,
    width: 300,
    height: 340,
    columns: 65,
  },
  {
    id: 'decoder',
    name: 'Decoder · 35 layers',
    detail: 'RMSNorm / attention / FFN / PLE',
    millions: 1870,
    component: 'decoder_model_merged',
    x: 480,
    y: 410,
    width: 580,
    height: 534,
    columns: 125,
  },
  {
    id: 'vision',
    name: 'Vision encoder',
    detail: 'ViT · unused for text input',
    millions: 150,
    component: 'vision_encoder',
    x: 380,
    y: 72,
    width: 320,
    height: 144,
    columns: 70,
  },
  {
    id: 'audio',
    name: 'Audio encoder',
    detail: 'Conformer · unused for text input',
    millions: 305,
    component: 'audio_encoder',
    x: 740,
    y: 72,
    width: 320,
    height: 144,
    columns: 70,
  },
]

export const dotCount = (millions: number): number =>
  Math.round((millions * 1_000_000) / PARAMETERS_PER_DOT)

export const totalParameters = blocks.reduce(
  (total, block) => total + block.millions * 1_000_000,
  0,
)

export const loadedParameters = (downloads: DownloadState): number =>
  blocks.reduce(
    (total, block) =>
      total +
      Math.floor(
        block.millions *
          1_000_000 *
          componentProgress(block.component, downloads),
      ),
    0,
  )

export const architectureView = <Message>(
  downloads: DownloadState,
  ready: boolean,
  h: HtmlBuilder<Message>,
) => {
  const rolling = RollingNumber.withMessage(h)
  const label = (
    x: number,
    y: number,
    text: string,
    className = 'diagram-label',
  ) => h.text([h.X(String(x)), h.Y(String(y)), h.Class(className)], [text])
  const wire = (path: string, optional = false) =>
    h.path([
      h.D(path),
      h.Class(optional ? 'diagram-wire optional-wire' : 'diagram-wire'),
    ])

  return h.div(
    [h.Class('architecture-scroll')],
    [
      h.svg(
        [
          h.ViewBox('0 -90 1100 1354'),
          h.Class('architecture-svg'),
          h.Role('group'),
          h.AriaLabel(
            'Gemma 4 E2B architecture. Square counts represent parameter counts. Filled squares represent component download progress.',
          ),
        ],
        [
          label(180, -62, 'TEXT', 'diagram-terminal'),
          wire('M180 -50 V-34'),
          label(180, -18, 'TEXT TOKENS', 'diagram-terminal'),
          wire('M180 -6 V10'),
          label(180, 26, 'TOKEN IDs', 'diagram-terminal'),
          wire('M180 38 V72'),
          wire('M180 48 H8 V390 H170 V410'),
          h.g(
            [h.Class('modality-inputs')],
            [
              label(540, 26, 'IMAGE', 'diagram-terminal'),
              label(900, 26, 'AUDIO', 'diagram-terminal'),
              wire('M540 38 V72'),
              wire('M900 38 V72'),
              wire('M540 216 V254'),
              wire('M900 216 V254'),
              label(540, 274, 'PROJECTED IMAGE EMBEDDINGS', 'diagram-terminal'),
              label(900, 274, 'PROJECTED AUDIO EMBEDDINGS', 'diagram-terminal'),
              wire('M540 288 V320'),
              wire('M900 288 V320 H540'),
            ],
          ),
          wire('M180 216 V320 H540'),
          h.circle([
            h.Cx('540'),
            h.Cy('320'),
            h.R('2'),
            h.Class('sequence-junction'),
          ]),
          wire('M540 320 V342'),
          label(540, 363, 'MULTIMODAL EMBEDDING SEQUENCE', 'diagram-terminal'),
          wire('M540 375 V390 H770 V410'),
          wire('M170 750 V783'),
          label(170, 805, '256-d auxiliary embedding', 'diagram-terminal'),
          label(170, 823, 'for each of the 35 layers', 'diagram-terminal'),
          wire('M170 839 V862 H480'),
          ...blocks.map(block => {
            const progress = ready
              ? 1
              : componentProgress(block.component, downloads)
            const count = dotCount(block.millions)
            const filled = Math.floor(count * progress)
            return h.keyed('g')(
              block.id,
              [h.Class('parameter-block')],
              [
                h.rect([
                  h.X(String(block.x)),
                  h.Y(String(block.y)),
                  h.Width(String(block.width)),
                  h.Height(String(block.height)),
                  h.Rx(String(5)),
                  h.Class('block-border'),
                ]),
                label(block.x + 18, block.y + 30, block.name, 'block-name'),
                label(block.x + 18, block.y + 76, block.detail, 'block-detail'),
                ...Array.makeBy(count, index =>
                  h.keyed('rect')(`${block.id}-${index}`, [
                    h.X(String(block.x + 18 + (index % block.columns) * 4)),
                    h.Y(
                      String(
                        block.y + 96 + Math.floor(index / block.columns) * 4,
                      ),
                    ),
                    h.Width('2'),
                    h.Height('2'),
                    h.Class(
                      index < filled ? 'parameter-dot filled' : 'parameter-dot',
                    ),
                  ]),
                ),
                h.foreignObject(
                  [
                    h.X(String(block.x + 18)),
                    h.Y(String(block.y + 35)),
                    h.Width(String(block.width - 36)),
                    h.Height('28'),
                  ],
                  [
                    h.div(
                      [
                        h.Class('parameter-counter'),
                        h.Title(
                          'Estimated loaded parameters from component file bytes; rounded model counts.',
                        ),
                      ],
                      [
                        rolling([
                          rolling.Value(
                            Math.floor(block.millions * 1_000_000 * progress),
                          ),
                          h.Class('loaded-parameters'),
                        ]),
                        h.span(
                          [h.Class('parameter-total')],
                          [
                            ` / ${(block.millions * 1_000_000).toLocaleString('fr-FR')}`,
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
                ...(block.id === 'decoder'
                  ? [
                      wire('M770 410 H1040 V600 H660 V660'),
                      h.path([
                        h.D('M480 862 H520 V669'),
                        h.Class('ple-connection'),
                      ]),
                      ...[
                        { number: 1, y: 660, fade: 'layer-full' },
                        { number: 2, y: 684, fade: 'layer-fading' },
                        { number: 3, y: 708, fade: 'layer-faint' },
                        { number: 33, y: 760, fade: 'layer-faint' },
                        { number: 34, y: 784, fade: 'layer-fading' },
                        { number: 35, y: 808, fade: 'layer-full' },
                      ].map(({ number, y, fade }) => {
                        return h.keyed('g')(
                          `layer-${number}`,
                          [h.Class('layer-hover')],
                          [
                            h.path([
                              h.D(`M520 ${y + 9} H550`),
                              h.Class('ple-connection'),
                            ]),
                            h.rect([
                              h.X('550'),
                              h.Y(String(y)),
                              h.Width('220'),
                              h.Height('18'),
                              h.Rx('3'),
                              h.Class(`decoder-layer ${fade}`),
                            ]),
                            label(
                              560,
                              y + 12,
                              `Layer ${String(number).padStart(2, '0')}`,
                              `layer-label ${fade}`,
                            ),
                            label(
                              620,
                              y + 12,
                              number % 5 === 0
                                ? 'Global attention'
                                : 'Local · 512-token window',
                              `layer-label ${fade}`,
                            ),
                            h.g(
                              [h.Class('layer-tooltip')],
                              [
                                h.rect([
                                  h.X('550'),
                                  h.Y(String(y - 57)),
                                  h.Width('240'),
                                  h.Height('48'),
                                  h.Rx('4'),
                                  h.Class('tooltip-border'),
                                ]),
                                label(
                                  562,
                                  y - 39,
                                  'Every fifth layer is global',
                                  'layer-label',
                                ),
                                label(
                                  562,
                                  y - 23,
                                  '4 local + 1 global, repeated 7 times',
                                  'layer-label',
                                ),
                              ],
                            ),
                          ],
                        )
                      }),
                      wire('M660 678 V684'),
                      wire('M660 702 V708'),
                      wire('M660 778 V784'),
                      wire('M660 802 V808'),
                      ...[740].flatMap(startY =>
                        Array.makeBy(3, index =>
                          h.circle([
                            h.Cx('660'),
                            h.Cy(String(startY + index * 3)),
                            h.R('0.65'),
                            h.Class('sequence-junction'),
                          ]),
                        ),
                      ),
                      h.path([
                        h.D('M770 669 H790 V588 H920'),
                        h.Class('layer-callout'),
                      ]),
                      h.rect([
                        h.X('800'),
                        h.Y('588'),
                        h.Width('230'),
                        h.Height('336'),
                        h.Rx('5'),
                        h.Class('decoder-layer'),
                      ]),
                      label(815, 611, 'INSIDE LAYER 01', 'block-detail'),
                      label(
                        915,
                        645,
                        'RMSNorm → Attention',
                        'diagram-terminal',
                      ),
                      label(915, 664, 'RMSNorm + residual', 'diagram-terminal'),
                      wire('M915 678 V697'),
                      label(915, 719, 'RMSNorm → FFN', 'diagram-terminal'),
                      label(915, 738, 'RMSNorm + residual', 'diagram-terminal'),
                      wire('M915 752 V771'),
                      label(915, 793, 'Gate × layer PLE', 'diagram-terminal'),
                      label(915, 812, 'Project → RMSNorm', 'diagram-terminal'),
                      label(915, 831, '+ residual', 'diagram-terminal'),
                      wire('M915 845 V864'),
                      label(915, 886, 'Scale → next layer', 'diagram-terminal'),
                      wire('M660 826 V944'),
                    ]
                  : []),
              ],
            )
          }),
          wire('M660 944 V974'),
          h.rect([
            h.X('430'),
            h.Y('974'),
            h.Width('460'),
            h.Height('62'),
            h.Rx('5'),
            h.Class('output-border'),
          ]),
          label(660, 999, 'Final RMSNorm', 'output-name'),
          label(
            660,
            1020,
            'Normalize the final hidden state',
            'diagram-terminal',
          ),
          wire('M660 1036 V1064'),
          h.rect([
            h.X('430'),
            h.Y('1064'),
            h.Width('460'),
            h.Height('62'),
            h.Rx('5'),
            h.Class('output-border'),
          ]),
          label(660, 1089, 'LM head', 'output-name'),
          label(
            660,
            1110,
            'Project to vocabulary logits · tied token weights',
            'diagram-terminal',
          ),
          wire('M660 1126 V1154'),
          label(660, 1176, 'LOGIT SOFTCAP (30)', 'diagram-terminal'),
          wire('M660 1189 V1216'),
          label(660, 1239, 'NEXT-TOKEN DISTRIBUTION', 'diagram-terminal'),
        ],
      ),
    ],
  )
}
