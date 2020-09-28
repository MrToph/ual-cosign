import { Api } from "eosjs";
import { SignTransactionConfig } from "universal-authenticator-library";
import { TEosioTransaction } from "./types";

const defaultTransactionHeader = {
  blocksBehind: 3,
  expireSeconds: 160,
};

export const sendTransactionScatter = async (
  eosApi: Api,
  tx: TEosioTransaction,
  txOptions: SignTransactionConfig,
  cosignEndpointish: string | Function
) => {
  const mergedOptions = { ...defaultTransactionHeader, txOptions };

  let serverTransactionPushArgs;
  try {
    serverTransactionPushArgs = await serverSign(
      tx,
      mergedOptions,
      cosignEndpointish
    );
  } catch (error) {
    console.error(`Error when requesting server signature: `, error.message);
  }

  let pushTransactionArgs;
  if (serverTransactionPushArgs) {
    // fake requiredKeys to only use user's keys, Scatter fails otherwise
    const requiredKeys = await eosApi.signatureProvider.getAvailableKeys();
    // must use server tx here because blocksBehind header might lead to different TAPOS tx header
    const serializedTx = serverTransactionPushArgs.serializedTransaction;
    const signArgs = {
      chainId: eosApi.chainId,
      requiredKeys,
      serializedTransaction: serializedTx,
      serializedContextFreeData: undefined,
      // important to include all abis of each contract used, otherwise Scatter silently fails
      // not responding after 'requestSignature' socket request
      abis: await eosApi.getTransactionAbis(
        eosApi.deserializeTransaction(serializedTx)
      ),
    };

    pushTransactionArgs = await eosApi.signatureProvider.sign(signArgs);
    // add server signature
    pushTransactionArgs.signatures.unshift(
      serverTransactionPushArgs.signatures[0]
    );
  } else {
    // no server response => sign original tx
    pushTransactionArgs = await eosApi.transact(tx, {
      ...mergedOptions,
      sign: true,
      broadcast: false,
    });
  }

  return eosApi.pushSignedTransaction(pushTransactionArgs);
};

export const sendTransactionAnchor = async (
  anchorSession,
  tx: TEosioTransaction,
  txOptions: SignTransactionConfig,
  cosignEndpointish: string | Function
) => {
  const mergedOptions = { ...defaultTransactionHeader, txOptions };
  // anchorSession only has .transact but it does not contain any other Api method
  // https://github.com/greymass/anchor-link/blob/master/src/link.ts#L26
  const dummyApi = new Api({
    rpc: anchorSession.link.rpc,
    signatureProvider: null as any,
  });
  let pushTransactionArgs;

  let serverTransactionPushArgs;
  try {
    serverTransactionPushArgs = await serverSign(
      tx,
      mergedOptions,
      cosignEndpointish
    );
  } catch (error) {
    console.error(`Error when requesting server signature: `, error.message);
  }

  if (serverTransactionPushArgs) {
    const serializedTx = serverTransactionPushArgs.serializedTransaction;
    pushTransactionArgs = await anchorSession.transact(
      {
        transaction: dummyApi.deserializeTransaction(serializedTx),
      },
      { broadcast: false }
    );
    // add server signature
    pushTransactionArgs.signatures.unshift(
      serverTransactionPushArgs.signatures[0]
    );
  } else {
    // no server response => sign original tx
    pushTransactionArgs = await anchorSession.transact(tx, {
      broadcast: false,
    });
  }

  return dummyApi.pushSignedTransaction(pushTransactionArgs);
};

async function serverSign(
  transaction,
  txHeaders,
  cosignEndpointish: string | Function
) {
  let pushTransactionArgs;
  if (typeof cosignEndpointish === `string`) {
    const rawResponse = await fetch(cosignEndpointish, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tx: transaction, txHeaders }),
    });

    const content = await rawResponse.json();
    if (content.error) throw new Error(content.error);

    pushTransactionArgs = {
      ...content,
      serializedTransaction: Buffer.from(content.serializedTransaction, `hex`),
    };
  } else if (typeof cosignEndpointish === `function`) {
    pushTransactionArgs = await cosignEndpointish(transaction, txHeaders);
  }

  return pushTransactionArgs;
}
