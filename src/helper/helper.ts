import uniqueFilename from 'unique-filename';
import fs from 'fs';
import os from 'os';

import * as IHelper from './helper-interfaces';
import * as ICardanoCli from './../cardano-cli/cardano-interfaces';

import { CardanoJS } from './../cardano-cli/cardano-cli';

export class CardanoHelper {
  createWallet(cardanoCliParam: ICardanoCli.CardanoCliParam, createWalletParams: IHelper.WalletParams): IHelper.Wallet {
    const cardano = new CardanoJS();

    const addressKeyGenParam: ICardanoCli.AddressKeyGenParam = {
      name: createWalletParams.walletName,
      dirPath: createWalletParams.dir,
    };
    const generatedAddressKeys = cardano.generateAddressKeys(cardanoCliParam, addressKeyGenParam);
    const address = cardano.buildAddress(cardanoCliParam, addressKeyGenParam, generatedAddressKeys);
    const wallet = {
      paymentAddressFile: address,
      verifyKeyFile: generatedAddressKeys.paymentVKeyPath,
      signingKeyFile: generatedAddressKeys.paymentSKeyPath,
    };

    return wallet;
  }

  getWallet(cardanoCliParam: ICardanoCli.CardanoCliParam, createWalletParams: IHelper.WalletParams): IHelper.Wallet {
    const cardano = new CardanoJS();
    const addressKeyGenParam: ICardanoCli.AddressKeyGenParam = {
      name: createWalletParams.walletName,
      dirPath: createWalletParams.dir,
    };
    const generatedAddressKeys = cardano.getAddressKeys(addressKeyGenParam);
    const address = cardano.getPaymentAddress(addressKeyGenParam);
    const wallet = {
      paymentAddressFile: address,
      verifyKeyFile: generatedAddressKeys.paymentVKeyPath,
      signingKeyFile: generatedAddressKeys.paymentSKeyPath,
    };
    return wallet;
  }

  getPolicyId(cardanoCliParam: ICardanoCli.CardanoCliParam, verifyKeyFile: string): string {
    const cardano = new CardanoJS();
    const keyHash = cardano.addressKeyHash(cardanoCliParam, verifyKeyFile);
    const policyScript = {
      keyHash,
      type: 'sig',
    };
    const unqiuetFileName = uniqueFilename(os.tmpdir());
    const policyScriptFile = `${unqiuetFileName}.policy.json`;
    fs.writeFileSync(policyScriptFile, JSON.stringify(policyScript));
    return cardano.transactionPolicyId(cardanoCliParam, policyScriptFile);
  }

  mintToken(cardanoCliParam: ICardanoCli.CardanoCliParam, mintTokenParams: IHelper.MintTokenParams) {
    const cardano = new CardanoJS();
    const txOutFile = uniqueFilename(os.tmpdir());
    const paymentAddress = mintTokenParams.paymentAddress;
    const receiverAddress = mintTokenParams.receiverAddress;
    const utxos = cardano.queryUtxo(cardanoCliParam, paymentAddress);
    const keyHash = cardano.addressKeyHash(cardanoCliParam, mintTokenParams.verifyKeyFile);

    const policyScript = {
      keyHash,
      type: 'sig',
    };
    const unqiuetFileName = uniqueFilename(os.tmpdir());
    const policyScriptFile = `${unqiuetFileName}.policy.json`;
    fs.writeFileSync(policyScriptFile, JSON.stringify(policyScript));
    const policyId = cardano.transactionPolicyId(cardanoCliParam, policyScriptFile);
    const assetName = mintTokenParams.token;
    const amount = mintTokenParams.amount;
    const token = `${policyId}.${assetName}`;
    const metadata = mintTokenParams.metaData;
    const metaDatatFilePath = `${unqiuetFileName}.metadata.json`;
    fs.writeFileSync(metaDatatFilePath, JSON.stringify(metadata));
    const senderMintTokensAmounts = cardano.extractAllTokensBalances(utxos);
    senderMintTokensAmounts[token] = amount;

    // const receiverMintTokensAmounts = []
    // receiverMintTokensAmounts['lovelace'] = senderMintTokensAmounts['lovelace'];
    // senderMintTokensAmounts['lovelace'] = 0;
    // receiverMintTokensAmounts[token] = amount;

    const mintTxOuts = [
      {
        paymentAddreess: receiverAddress,
        amount: senderMintTokensAmounts,
      },
    ];

    // service fee
    if (mintTokenParams.servicePaymentAddress) {
      const serviceMintTokensAmounts = [];
      serviceMintTokensAmounts['lovelace'] = mintTokenParams.serviceFee;
      // deduct service fee
      mintTxOuts[0].amount['lovelace'] -= mintTokenParams.serviceFee;
      mintTxOuts.push({
        paymentAddreess: mintTokenParams.servicePaymentAddress,
        amount: serviceMintTokensAmounts,
      });
    }

    const mintDraftTransaction = {
      txIns: utxos.map((txIn, index) => {
        return {
          txHash: txIn.txHash,
          txIx: txIn.txId,
        };
      }),
      txOuts: mintTxOuts,
      fee: 0,
      invalidHereafter: 0,
      outFile: `${txOutFile}.mint.draft.tx`,
      mintOptions: {
        token,
        amount,
        metaDataJsonFile: metaDatatFilePath,
        mintScriptFile: policyScriptFile,
      },
    };

    cardano.buildRawTransaction(cardanoCliParam, mintDraftTransaction);
    const protocolParametersFile = uniqueFilename(os.tmpdir()) + '.protocolparameters.json';
    cardano.protocolParameters(cardanoCliParam, protocolParametersFile);

    const mintFeeCalculationParams = {
      txBodyFile: mintDraftTransaction.outFile,
      txInCount: mintDraftTransaction.txIns.length,
      txOutCount: mintDraftTransaction.txOuts.length,
      witnessCount: 2,
      byronWitnessCount: 0,
      protocolParamsFile: protocolParametersFile,
    };

    const mintFee = cardano.calculaeMinFee(cardanoCliParam, mintFeeCalculationParams);
    // deduct minting fee
    mintTxOuts[0].amount['lovelace'] -= mintFee;

    const tip = JSON.parse(cardano.queryTip(cardanoCliParam));
    const timeToLive = tip.slot + 10000; // just an example

    const mintTransaction = {
      txIns: utxos.map((txIn, index) => {
        return {
          txHash: txIn.txHash,
          txIx: txIn.txId,
        };
      }),
      txOuts: mintTxOuts,
      fee: mintFee,
      invalidHereafter: timeToLive,
      outFile: `${txOutFile}.mint.raw.tx`,
      mintOptions: {
        token,
        amount,
        metaDataJsonFile: metaDatatFilePath,
        mintScriptFile: policyScriptFile,
      },
    };

    cardano.buildRawTransaction(cardanoCliParam, mintTransaction);
    const mintTxRawOutFilePath = mintTransaction.outFile;

    const mintTransactionSignParams = {
      txRawBodyFile: mintTxRawOutFilePath,
      signingKeyFile: mintTokenParams.signingKeyFile,
      outFile: `${mintTxRawOutFilePath}.signed`,
    };

    cardano.signTransction(cardanoCliParam, mintTransactionSignParams);
    cardano.submitTransction(cardanoCliParam, mintTransactionSignParams.outFile);
  }

  calculateMintFee(cardanoCliParam: ICardanoCli.CardanoCliParam, mintTokenParams: IHelper.MintTokenParams): number {
    const cardano = new CardanoJS();
    const txOutFile = uniqueFilename(os.tmpdir());
    const paymentAddress = mintTokenParams.paymentAddress;
    const receiverAddress = mintTokenParams.receiverAddress;
    const utxos = cardano.queryUtxo(cardanoCliParam, paymentAddress);
    const keyHash = cardano.addressKeyHash(cardanoCliParam, mintTokenParams.verifyKeyFile);

    const policyScript = {
      keyHash,
      type: 'sig',
    };
    const unqiuetFileName = uniqueFilename(os.tmpdir());
    const policyScriptFile = `${unqiuetFileName}.policy.json`;
    fs.writeFileSync(policyScriptFile, JSON.stringify(policyScript));
    const policyId = cardano.transactionPolicyId(cardanoCliParam, policyScriptFile);
    const assetName = mintTokenParams.token;
    const amount = mintTokenParams.amount;
    const token = `${policyId}.${assetName}`;
    const metadata = mintTokenParams.metaData;
    const metaDatatFilePath = `${unqiuetFileName}.metadata.json`;
    fs.writeFileSync(metaDatatFilePath, JSON.stringify(metadata));
    const senderMintTokensAmounts = cardano.extractAllTokensBalances(utxos);

    if (!senderMintTokensAmounts['lovelace']) {
      senderMintTokensAmounts['lovelace'] = 0;
    }

    senderMintTokensAmounts[token] = amount;

    const mintTxOuts = [
      {
        paymentAddreess: receiverAddress,
        amount: senderMintTokensAmounts,
      },
    ];

    const mintDraftTransaction = {
      txIns: utxos.map((txIn, index) => {
        return {
          txHash: txIn.txHash,
          txIx: txIn.txId,
        };
      }),
      txOuts: mintTxOuts,
      fee: 0,
      invalidHereafter: 0,
      outFile: `${txOutFile}.mint.draft.tx`,
      mintOptions: {
        token,
        amount,
        metaDataJsonFile: metaDatatFilePath,
        mintScriptFile: policyScriptFile,
      },
    };

    cardano.buildRawTransaction(cardanoCliParam, mintDraftTransaction);
    const protocolParametersFile = uniqueFilename(os.tmpdir()) + '.protocolparameters.json';
    cardano.protocolParameters(cardanoCliParam, protocolParametersFile);

    const mintFeeCalculationParams = {
      txBodyFile: mintDraftTransaction.outFile,
      txInCount: mintDraftTransaction.txIns.length,
      txOutCount: mintDraftTransaction.txOuts.length,
      witnessCount: 2,
      byronWitnessCount: 0,
      protocolParamsFile: protocolParametersFile,
    };

    const mintFee = cardano.calculaeMinFee(cardanoCliParam, mintFeeCalculationParams);
    return mintFee;
  }

  transferAda(cardanoCliParam: ICardanoCli.CardanoCliParam, transferAdaParams: IHelper.TransferAdaParams) {
    const cardano = new CardanoJS();
    const senderPaymentAddress = transferAdaParams.senderPaymentAddress;
    const receiverPaymentAddress = transferAdaParams.receiverPaymentAddress;
    const utxos = cardano.queryUtxo(cardanoCliParam, senderPaymentAddress);
    const txOutFile = uniqueFilename(os.tmpdir());
    const amountToSend = transferAdaParams.lovelaceAmount;

    const receiverTxOuts = [
      {
        paymentAddreess: receiverPaymentAddress,
        amount: {
          lovelace: amountToSend,
        },
      },
    ];

    const tokensAmounts = cardano.extractAllTokensBalances(utxos);

    tokensAmounts['lovelace'] -= amountToSend;

    const txOuts = [
      {
        paymentAddreess: receiverPaymentAddress,
        amount: {
          lovelace: amountToSend,
        },
      },
      {
        paymentAddreess: senderPaymentAddress,
        amount: tokensAmounts,
      },
    ];

    // console.log(tokensAmounts);
    // console.log(txOuts);

    const draftTransaction = {
      txIns: utxos.map((txIn, index) => {
        return {
          txHash: txIn.txHash,
          txIx: txIn.txId,
        };
      }),
      txOuts,
      fee: 0,
      invalidHereafter: 0,
      outFile: `${txOutFile}.draft.tx`,
      mintOptions: null,
    };

    cardano.buildRawTransaction(cardanoCliParam, draftTransaction);

    const protocolParametersFile = uniqueFilename(os.tmpdir()) + '.protocolparameters.json';
    cardano.protocolParameters(cardanoCliParam, protocolParametersFile);

    const feeCalculationParams = {
      txBodyFile: draftTransaction.outFile,
      txInCount: draftTransaction.txIns.length,
      txOutCount: draftTransaction.txOuts.length,
      witnessCount: 2,
      byronWitnessCount: 0,
      protocolParamsFile: protocolParametersFile,
    };

    const fee = cardano.calculaeMinFee(cardanoCliParam, feeCalculationParams);
    const tip = JSON.parse(cardano.queryTip(cardanoCliParam));
    const timeToLive = tip.slot + 10000; //
    txOuts[1].amount['lovelace'] -= fee;

    const transaction = {
      txIns: utxos.map((txIn, index) => {
        return {
          txHash: txIn.txHash,
          txIx: txIn.txId,
        };
      }),
      txOuts,
      fee,
      invalidHereafter: timeToLive,
      outFile: `${txOutFile}.raw.tx`,
      mintOptions: null,
    };

    cardano.buildRawTransaction(cardanoCliParam, transaction);

    const txRawOutFilePath = transaction.outFile;

    const transactionSignParams = {
      txRawBodyFile: txRawOutFilePath,
      signingKeyFile: transferAdaParams.signingKeyFile,
      outFile: `${txRawOutFilePath}.signed`,
    };
    cardano.signTransction(cardanoCliParam, transactionSignParams);
    cardano.submitTransction(cardanoCliParam, transactionSignParams.outFile);
  }
}
