import type { ClassProvider, DependencyContainer, FactoryProvider, InjectionToken, ValueProvider } from 'tsyringe';
import { container as defaultContainer } from 'tsyringe';

type Constructor<T> = new (...args: unknown[]) => T;

export type Providers<T> = ValueProvider<T> | FactoryProvider<T> | ClassProvider<T> | Constructor<T>;

export interface InjectionObject<T> {
  token: InjectionToken<T>;
  provider: Providers<T>;
}

export const registerDependencies = (
  dependencies: InjectionObject<unknown>[],
  override?: InjectionObject<unknown>[],
  useChild = false
): DependencyContainer => {
  const container = useChild ? defaultContainer.createChildContainer() : defaultContainer;
  dependencies.forEach((injectionObj) => {
    const inject = override?.find((overrideObj) => overrideObj.token === injectionObj.token) === undefined;
    if (inject) {
      container.register(injectionObj.token, injectionObj.provider as Constructor<unknown>);
    }
  });
  override?.forEach((injectionObj) => {
    container.register(injectionObj.token, injectionObj.provider as Constructor<unknown>);
  });
  return container;
};
