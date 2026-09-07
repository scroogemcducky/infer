import { Stream } from 'effect'

export interface LlmEngine {
  generate(prompt: string): Stream.Stream<string, Error>
  close(): Promise<void>
}
