import { Effect, Queue, Stream } from 'effect'
import { ManagedResource, Runtime, Subscription } from 'foldkit'

import type { LoadProgress } from './architecture/progress'
import { registerRollingNumber } from './architecture/rolling-number'
import {
  EngineResource,
  Message,
  Model,
  createManagedResources,
  init,
  subscriptions,
  update,
  view,
} from './main'

registerRollingNumber()

const loadingProgress = Effect.runSync(Queue.make<LoadProgress>())

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  managedResources: createManagedResources(progress => {
    Queue.offerUnsafe(loadingProgress, progress)
  }),
  subscriptions: Subscription.aggregate<
    Model,
    Message,
    ManagedResource.ServiceOf<typeof EngineResource>
  >()(
    subscriptions,
    Subscription.make<Model, Message>()(() => ({
      loading: Subscription.persistent(
        Stream.fromQueue(loadingProgress).pipe(
          Stream.map(progress => Message.UpdatedModelDownload({ progress })),
          Stream.ensuring(Queue.shutdown(loadingProgress)),
        ),
      ),
    })),
  ),
  container: document.getElementById('root'),
  devTools: {
    Message,
  },
})

Runtime.run(application)
