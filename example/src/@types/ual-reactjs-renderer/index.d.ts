import { User, Authenticator } from 'universal-authenticator-library';
// https://github.com/EOSIO/universal-authenticator-library/blob/069755cf349635763e20f0d5a5e1e349d2d237bc/src/interfaces.ts
interface RpcEndpoint {
  protocol: string;
  host: string;
  port: number;
}

interface Chain {
  chainId: string;
  rpcEndpoints: RpcEndpoint[];
}

interface UAL {
  chains: Chain[];
  authenticators: Authenticator[];
  availableAuthenticators: any[];
  activeUser: User;
  activeAuthenticator: Authenticator;
  appName: string;
}

// is not picked up for some reason ...
declare module 'ual-reactjs-renderer' {
  export interface UALProps {
    ual: UAL;
  }
  export const UALProvider: React.Component<UALProps>;
  export const withUAL: Function;
}
