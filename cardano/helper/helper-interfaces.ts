
export interface TransferAdaParams{
  senderPaymentAddress:string;
  receiverPaymentAddress:string;
  signingKeyFile:string;
  lovelaceAmount:number;
}

export interface MintTokenParams{
  receiverAddress:string;
  paymentAddress:string;
  verifyKeyFile:string;
  signingKeyFile:string;
  token:string;
  amount:number;
  metaData:any;
  serviceFee:number;
  servicePaymentAddress:string;
}

export interface WalletParams{
    dir:string;
    walletName:string;
}

export interface Wallet{
  paymentAddressFile:string;
  verifyKeyFile:string;
  signingKeyFile:string;
}