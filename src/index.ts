import {
  User,
  Authenticator,
  SignTransactionConfig,
  SignTransactionResponse,
  UALError,
  UALErrorType,
} from "universal-authenticator-library";
import get from "lodash/get";
import { sendTransactionAnchor, sendTransactionScatter } from "./cosign";
import { TEosioTransaction } from "./types";

type UAL = {
  activeUser: User;
  activeAuthenticator: Authenticator;
};
type TEnhanceUALOptions = {
  cosignEndpoint: string | Function;
};
type TWrappedUAL = {
  getAuthenticatorName(): string;
  changeRpcEndpoint(nodeEndpoint: string);
  cosignTransaction(
    transaction: TEosioTransaction,
    options: SignTransactionConfig
  ): Promise<SignTransactionResponse>;
  supportsCosign(): boolean;
};
type TSupportedAuthenticators =
  | `Scatter`
  | `anchor`
  | `Lynx`
  | `MEETONE`
  | `Token Pocket`
  | `Ledger`
  | `UNKNOWN`;
const wrapUAL = (ual: UAL, options: TEnhanceUALOptions) => {
  const wrap = {
    getAuthenticatorName(): TSupportedAuthenticators {
      // MEETONE doesn't have this function
      return ual.activeAuthenticator.getName
        ? (ual.activeAuthenticator.getName() as TSupportedAuthenticators)
        : `UNKNOWN`;
    },
    async getAuthenticatorUALErrorConstructor(): Promise<any> {
      return UALError;
      // fake the correct authenticator error, i.e. UALAnchorError, UALScatterError, etc.
      // ugly but works, as soon as a field on tx or txOptions is accessed it throws an error
      // we don't want to trigger an actual wallet signing popup
      // TOOO: currently does not return UALScatter correctly because it blows up
      // in the function's header when destructuring, not in the try .. catch
      // try {
      //   const explodeProxy = new Proxy(
      //     {},
      //     {
      //       get() {
      //         throw new Error(`trigger error`);
      //       },
      //     }
      //   );
      //   await ual.activeUser.signTransaction(explodeProxy, explodeProxy);
      //   return UALError;
      // } catch (specificUalError) {
      //   return specificUalError && specificUalError.constructor
      //     ? specificUalError.constructor
      //     : UALError;
      // }
    },
    getRpc() {
      switch (this.getAuthenticatorName()) {
        case `UNKNOWN`: {
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
    supportsCosign() {
      const COSIGN_SUPPORTED_AUTHENTICATORS: TSupportedAuthenticators[] = [
        `anchor`,
        `Scatter`,
      ];
      return COSIGN_SUPPORTED_AUTHENTICATORS.includes(
        wrap.getAuthenticatorName()
      );
    },
    async cosignTransaction(
      tx: TEosioTransaction,
      txOptions: SignTransactionConfig
    ): Promise<SignTransactionResponse> {
      if (
        !txOptions ||
        (typeof txOptions.broadcast !== `undefined` && !txOptions.broadcast)
      )
        throw new Error(`cosign transaction must be broadcast`);

      // if cosign not supported, send normal tx
      if (!wrap.supportsCosign())
        return ual.activeUser.signTransaction(tx, txOptions);

      try {
        let completedTransaction;

        switch (wrap.getAuthenticatorName()) {
          case `Scatter`: {
            const api = (ual.activeUser as any).api;
            // scatter-ual uses the scatter constructor which wrongly proxies api fields
            if (typeof api.signatureProvider === `function`)
              throw new Error(
                `Please use scatter-ual-protocol instead of ual-scatter`
              );
            completedTransaction = await sendTransactionScatter(
              api,
              tx,
              txOptions,
              options.cosignEndpoint
            );
            break;
          }
          case `anchor`: {
            completedTransaction = await sendTransactionAnchor(
              (ual.activeUser as any).session,
              tx,
              txOptions,
              options.cosignEndpoint
            );
            break;
          }
          default: {
            throw new Error(
              `UAL.cosignTransaction: unsupported cosign authenticator: Should never get here`
            );
          }
        }

        if (completedTransaction.hasOwnProperty("transaction_id")) {
          return {
            wasBroadcast: true,
            transactionId: completedTransaction.transaction_id,
            status: completedTransaction.processed.receipt.status,
            transaction: completedTransaction,
          };
        } else if (completedTransaction.hasOwnProperty("code")) {
          return {
            wasBroadcast: true,
            error: {
              code: completedTransaction.code,
              message: completedTransaction.message,
              name: completedTransaction.error.name,
            },
            transaction: completedTransaction,
          };
        } else {
          return {
            wasBroadcast: true,
            transaction: completedTransaction,
          };
        }
      } catch (error) {
        const AuthenticatorUALError = await wrap.getAuthenticatorUALErrorConstructor();
        throw new AuthenticatorUALError(
          "Unable to sign the given transaction",
          UALErrorType.Signing,
          error,
          wrap.getAuthenticatorName()
        );
      }
    },
  };

  return wrap;
};

type TEnhanceUAL<T> = T & TWrappedUAL;

export const enhanceUAL = <T extends UAL>(
  ual: T,
  options: TEnhanceUALOptions = {
    cosignEndpoint: () =>
      Promise.reject(new Error(`No cosignEndpoint option passed`)),
  }
): TEnhanceUAL<T> => {
  const wrappedUAL = wrapUAL(ual, options);
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
