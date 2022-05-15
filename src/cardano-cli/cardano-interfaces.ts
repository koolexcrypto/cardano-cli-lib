export interface GeneratedAddressKeys {
  paymentVKeyPath: string;
  paymentSKeyPath: string;
}

export interface AddressKeyGenParam {
  name: string;
  dirPath: string;
}

export interface queryUtxoRow {
  txHash: string;
  txId: number;
  amount: any;
  raw: string;
}

export interface CardanoCliParam {
  cardanoCliCmd: string;
  network: string;
}

// export interface QueryUTXOParam {
//   paymentAddress:string
// }

export interface MintOptions {
  token: string;
  amount: number;
  mintScriptFile: any;
  metaDataJsonFile: string;
}

export interface Transaction {
  txIns: TxIn[];
  txOuts: TxOut[];
  fee: number;
  invalidHereafter: number;
  outFile: string;
  mintOptions: MintOptions;
}

export interface TxIn {
  txHash: string;
  txIx: number;
}

export interface TxOut {
  paymentAddreess: string;
  amount: any;
}

export interface FeeCalculationParams {
  txBodyFile: string;
  txInCount: number;
  txOutCount: number;
  witnessCount: number;
  byronWitnessCount: number;
  protocolParamsFile: string;
}

export interface TransactionViewParams {
  txBodyFile: string;
  signingKeyFile: string;
  outFile: string;
}

export interface TransactionSignParams {
  txRawBodyFile: string;
  signingKeyFile: string;
  outFile: string;
}
