import { execSync } from 'child_process';
import { nextTick } from 'process';
import fs from 'fs';
import * as ICardanoCli from './cardano-interfaces';

const accountsDirName = 'cardano';

export class CardanoJS {
  extractUtxoAmount(amountArr: string[]): any {
    const amount = {};
    let txOutDatumHash;
    let i = 0;
    while (i < amountArr.length) {
      if (amountArr[i] === '+') {
        i++;
      } else {
        if (amountArr[i] === 'TxOutDatumHashNone' || amountArr[i] === 'TxOutDatumNone') {
          i++;
        } else if (amountArr[i] === 'TxOutDatumHash' || amountArr[i] === 'TxOutDatum') {
          amount['txOutDatumHash'] = [amountArr?.[i + 1], amountArr?.[i + 2]];
          i += 3;
        } else {
          const quantity = parseInt(amountArr[i]);
          const token = amountArr?.[i + 1];
          amount[token] = quantity;
          i += 2;
        }
      }
    }

    return amount;
  }

  queryUtxo(cardanoCliParam: ICardanoCli.CardanoCliParam, paymentAddress: string): ICardanoCli.queryUtxoRow[] {
    if (!paymentAddress) {
      throw new Error(`Payment address is required`);
    }

    const utxosRaw = execSync(`${cardanoCliParam.cardanoCliCmd} query utxo \
            --${cardanoCliParam.network} \
            --address ${paymentAddress} \
            --cardano-mode
            `).toString();

    const utxosArr = utxosRaw.split('\n');
    utxosArr.splice(0, 2);
    utxosArr.pop();

    const result = utxosArr.map((line, index) => {
      const utxo = line.replace(/\s+/g, ' ').split(' ');
      const txHash = utxo[0];
      const txId = parseInt(utxo[1]);
      const amount = this.extractUtxoAmount(utxo.slice(2, utxo.length));
      const res = { txHash, txId, amount, raw: line };
      return res;
    });
    return result;
  }

  lovelaceBalance(cardanoCliParam: ICardanoCli.CardanoCliParam, paymentAddress: string): number {
    return this.tokenBalance(cardanoCliParam, paymentAddress, 'lovelace');
  }

  adaBalance(cardanoCliParam: ICardanoCli.CardanoCliParam, paymentAddress: string): number {
    return this.tokenBalance(cardanoCliParam, paymentAddress, 'lovelace') / 1000000;
  }

  tokenBalance(cardanoCliParam: ICardanoCli.CardanoCliParam, paymentAddress: string, token: string): number {
    let amount: number = 0;
    let utxo = this.queryUtxo(cardanoCliParam, paymentAddress);
    for (let i = 0; i < utxo.length; i++) {
      amount += utxo[i]?.amount?.[token];
    }
    return amount;
  }

  generateAddressKeys(
    cardanoCliParam: ICardanoCli.CardanoCliParam,
    addressKeyGenParam: ICardanoCli.AddressKeyGenParam,
  ): ICardanoCli.GeneratedAddressKeys {
    if (!addressKeyGenParam.dirPath || !addressKeyGenParam.name) {
      throw new Error(`Directory or name is empty`);
    }
    const accountDirPath = `${addressKeyGenParam.dirPath}/${addressKeyGenParam.name}`;
    const paymentVKeyPath = `${accountDirPath}/${addressKeyGenParam.name}-pay.vkey`;
    const paymentSKeyPath = `${accountDirPath}/${addressKeyGenParam.name}-pay.skey`;

    if (fs.existsSync(paymentVKeyPath) || fs.existsSync(paymentSKeyPath)) {
      throw new Error(`Payment keys have been already set or generated`);
    }

    execSync(`mkdir -p ${accountDirPath}`, { stdio: 'inherit' });
    execSync(`
            ${cardanoCliParam.cardanoCliCmd} address key-gen \
            --verification-key-file ${paymentVKeyPath} \
            --signing-key-file ${paymentSKeyPath}
            `);

    return {
      paymentVKeyPath: paymentVKeyPath,
      paymentSKeyPath: paymentSKeyPath,
    };
  }

  getAddressKeys(addressKeyGenParam: ICardanoCli.AddressKeyGenParam): ICardanoCli.GeneratedAddressKeys {
    if (!addressKeyGenParam.dirPath || !addressKeyGenParam.name) {
      throw new Error(`Directory or name is empty`);
    }
    const accountDirPath = `${addressKeyGenParam.dirPath}/${addressKeyGenParam.name}`;
    const paymentVKeyPath = `${accountDirPath}/${addressKeyGenParam.name}-pay.vkey`;
    const paymentSKeyPath = `${accountDirPath}/${addressKeyGenParam.name}-pay.skey`;

    return {
      paymentVKeyPath: paymentVKeyPath,
      paymentSKeyPath: paymentSKeyPath,
    };
  }

  buildAddress(
    cardanoCliParam: ICardanoCli.CardanoCliParam,
    addressKeyGenParam: ICardanoCli.AddressKeyGenParam,
    generatedAddressKeys: ICardanoCli.GeneratedAddressKeys,
  ): string {
    if (!addressKeyGenParam.dirPath || !addressKeyGenParam.name) {
      throw new Error(`Directory or name is empty`);
    }

    const accountDirPath = `${addressKeyGenParam.dirPath}/${addressKeyGenParam.name}`;
    const paymentVKeyPath = generatedAddressKeys.paymentVKeyPath;
    const paymentSKeyPath = generatedAddressKeys.paymentSKeyPath;

    if (!fs.existsSync(paymentVKeyPath) || !fs.existsSync(paymentSKeyPath)) {
      throw new Error(`Payment keys are missing. Please call generateAddressKeys method first`);
    }

    const paymentAddressPath = `${accountDirPath}/${addressKeyGenParam.name}.pay.addr`;

    if (fs.existsSync(paymentAddressPath)) {
      throw new Error(`Payment address has been already set or generated`);
    }

    execSync(`
                  ${cardanoCliParam.cardanoCliCmd} address build \
                  --payment-verification-key-file ${paymentVKeyPath} \
                  --out-file ${paymentAddressPath} \
                  --${cardanoCliParam.network}
              `);
    return paymentAddressPath;
  }

  getPaymentAddress(addressKeyGenParam: ICardanoCli.AddressKeyGenParam): string {
    if (!addressKeyGenParam.dirPath || !addressKeyGenParam.name) {
      throw new Error(`Directory or name is empty`);
    }

    const accountDirPath = `${addressKeyGenParam.dirPath}/${addressKeyGenParam.name}`;
    const paymentAddressPath = `${accountDirPath}/${addressKeyGenParam.name}.pay.addr`;
    return paymentAddressPath;
  }

  buildRawTransaction(cardanoCliParam: ICardanoCli.CardanoCliParam, transaction: ICardanoCli.Transaction): void {
    const txIns = transaction.txIns
      .map((txIn, index) => {
        return ` --tx-in ${txIn.txHash}#${txIn.txIx}`;
      })
      .join('');
    const txOuts = transaction.txOuts
      .map((txOut, index) => {
        let t = ` --tx-out ${txOut.paymentAddreess}+${txOut.amount.lovelace}`;
        let nativeTokenAmounts = '';
        for (var token of Object.keys(txOut.amount)) {
          if (token !== 'lovelace') {
            nativeTokenAmounts += `${txOut.amount[token]} ${token} + `;
          }
        }
        if (nativeTokenAmounts !== '') {
          nativeTokenAmounts = nativeTokenAmounts.slice(0, -3);
          t += `+"${nativeTokenAmounts}"`;
        }
        return t;
      })
      .join('');

    let mintOptionsCMD = '';
    if (transaction.mintOptions) {
      mintOptionsCMD = ` --mint="${transaction.mintOptions.amount} ${transaction.mintOptions.token}" --mint-script-file ${transaction.mintOptions.mintScriptFile} `;
      if (transaction.mintOptions.metaDataJsonFile) {
        mintOptionsCMD += ` --metadata-json-file ${transaction.mintOptions.metaDataJsonFile} `;
      }
    }

    const cmd = `${cardanoCliParam.cardanoCliCmd} transaction build-raw \
  ${txIns}${txOuts} \
  --invalid-hereafter ${transaction.invalidHereafter} \
  --fee ${transaction.fee} \
  ${mintOptionsCMD} \
  --out-file ${transaction.outFile}`;
    console.log(cmd);
    const transactionBuildRaw = execSync(`${cmd}`);
  }

  calculaeMinFee(
    cardanoCliParam: ICardanoCli.CardanoCliParam,
    feeCalculationParams: ICardanoCli.FeeCalculationParams,
  ): number {
    const cmd = `${cardanoCliParam.cardanoCliCmd} transaction calculate-min-fee \
  --tx-body-file ${feeCalculationParams.txBodyFile} \
  --tx-in-count ${feeCalculationParams.txInCount} \
  --tx-out-count ${feeCalculationParams.txOutCount} \
  --witness-count ${feeCalculationParams.witnessCount} \
  --byron-witness-count ${feeCalculationParams.byronWitnessCount} \
  --mainnet \
  --protocol-params-file ${feeCalculationParams.protocolParamsFile}
  `;
    console.log(cmd);
    const calcFee = execSync(`${cmd}`).toString();
    return parseInt(calcFee.split(' ')[0]);
  }

  protocolParameters(cardanoCliParam: ICardanoCli.CardanoCliParam, filePath: string): void {
    const cmd = `${cardanoCliParam.cardanoCliCmd} query protocol-parameters \
  --${cardanoCliParam.network} \
  --out-file ${filePath}
  `;
    console.log(cmd);
    const protocolParameters = execSync(`${cmd}`);
  }

  queryTip(cardanoCliParam: ICardanoCli.CardanoCliParam): string {
    const cmd = `${cardanoCliParam.cardanoCliCmd} query tip \
  --${cardanoCliParam.network} \
  `;
    console.log(cmd);
    const tip = execSync(`${cmd}`).toString();
    return tip;
  }

  signTransction(
    cardanoCliParam: ICardanoCli.CardanoCliParam,
    transactionSignParams: ICardanoCli.TransactionSignParams,
  ): void {
    const cmd = `${cardanoCliParam.cardanoCliCmd} transaction sign \
  --tx-body-file ${transactionSignParams.txRawBodyFile} \
  --signing-key-file ${transactionSignParams.signingKeyFile} \
  --${cardanoCliParam.network} \
  --out-file ${transactionSignParams.outFile}
  `;
    console.log(cmd);
    const signT = execSync(`${cmd}`);
  }

  submitTransction(cardanoCliParam: ICardanoCli.CardanoCliParam, filePath: string): void {
    const cmd = `${cardanoCliParam.cardanoCliCmd} transaction submit \
  --tx-file ${filePath} \
  --${cardanoCliParam.network}
  `;
    console.log(cmd);
    execSync(`${cmd}`);
  }

  transactionView(cardanoCliParam: ICardanoCli.CardanoCliParam, txFilePath: string): string {
    const cmd = `${cardanoCliParam.cardanoCliCmd} transaction view \
  --tx-file ${txFilePath} 
  `;
    console.log(cmd);
    return execSync(`${cmd}`).toString();
  }

  extractAllTokensBalances(utxosParam: ICardanoCli.queryUtxoRow[]) {
    const tokens = [];
    for (let i = 0; i < utxosParam.length; i++) {
      const utxoAmount = utxosParam[i].amount;
      for (var token in utxoAmount) {
        if (utxoAmount.hasOwnProperty(token)) {
          if (!tokens[token]) {
            tokens[token] = 0;
          }
          tokens[token] += utxoAmount[token];
        }
      }
    }
    return tokens;
  }

  addressKeyHash(cardanoCliParam: ICardanoCli.CardanoCliParam, paymentVKeyPath: string): string {
    const cmd = `${cardanoCliParam.cardanoCliCmd} address key-hash \
  --payment-verification-key-file ${paymentVKeyPath} \
  `;
    console.log(cmd);
    return execSync(`${cmd}`).toString().trim();
  }

  transactionPolicyId(cardanoCliParam: ICardanoCli.CardanoCliParam, scriptFilePath: string): string {
    const cmd = `${cardanoCliParam.cardanoCliCmd} transaction policyid \
  --script-file ${scriptFilePath} \
  `;
    console.log(cmd);
    return execSync(`${cmd}`).toString().trim();
  }

  mint(): void {}
}
