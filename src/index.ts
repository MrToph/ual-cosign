import { User, Authenticator } from "universal-authenticator-library";
import get from "lodash/get";

type UAL = {
  activeUser: User;
  activeAuthenticator: Authenticator;
};
type TWrappedUAL = {
  getAuthenticatorName(): string;
  changeRpcEndpoint(nodeEndpoint: string);
};
type TSupportedAuthenticators =
  | `Scatter`
  | `anchor`
  | `Lynx`
  | `MEETONE`
  | `Token Pocket`
  | `Ledger`;
const wrapUAL = (ual: UAL) => {
  const wrap = {
    getAuthenticatorName(): TSupportedAuthenticators | `` {
      // MEETONE doesn't have this function
      return ual.activeAuthenticator.getName
        ? (ual.activeAuthenticator.getName() as TSupportedAuthenticators)
        : ``;
    },
    getRpc() {
      switch (this.getAuthenticatorName()) {
        case ``: {
          return undefined;
        }
        case `anchor`: {
          const rpc = get(ual, `activeUser.session.link.rpc`);
          if (!rpc) throw new Error(`Could not get rpc object for Anchor`);
          return rpc;
        }
        case `Scatter`: {
          const rpc = get(ual, `activeUser.rpc`);
          if (!rpc) throw new Error(`Could not get rpc object for Scatter`);
          return rpc;
        }
        case `Ledger`: {
          const rpc = get(ual, `activeUser.rpc`);
          if (!rpc) throw new Error(`Could not get rpc object for Ledger`);
          return rpc;
        }
        // all mobile authenticators have a custom request protocol
        // and define their node endpoints within the app
        default: {
          const rpc = get(ual, `activeUser.rpc`, undefined);
          // rpc or undefined
          return rpc;
        }
      }
    },
    changeRpcEndpoint(nodeEndpoint: string) {
      const rpc = this.getRpc();
      if (!rpc) return;
      rpc.endpoint = nodeEndpoint;
    },
  };

  return wrap;
};

type TEnhanceUAL<T> = T & TWrappedUAL;

export const enhanceUAL = <T extends UAL>(ual: T): TEnhanceUAL<T> => {
  const wrappedUAL = wrapUAL(ual);
  return new Proxy(ual, {
    get(target, prop) {
      if (prop in wrappedUAL) {
        return wrappedUAL[prop];
      }
      return target[prop];
    },
    // needed to make it work with mobx observable and other libraries that iterate over all keys
    ownKeys(target) {
      return [...new Set(Object.keys(target).concat(Object.keys(wrappedUAL)))];
    },
    getOwnPropertyDescriptor(target, prop) {
      return (
        Object.getOwnPropertyDescriptor(wrappedUAL, prop) ||
        Object.getOwnPropertyDescriptor(target, prop)
      );
    },
  }) as any;
};
