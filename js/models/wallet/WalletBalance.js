import { integerToDecimal } from '../../utils/currency';
import app from '../../app';
import BaseModel from '../BaseModel';

export default class extends BaseModel {
  // constructor(...args) {
  //   super(...args);
  //   this.balanceAvailable = false;
  // }

  url() {
    return app.getServerUrl('wallet/balance/');
  }

  // get walletReady() {
  //   return this._walletReady;
  // }

  // _setWalletReady(bool) {
  //   if (bool !== this._walletReady) {
  //     this._walletReady = bool;
  //     this.trigger('changeWalletReady', bool);
  //   }
  // }

  get isBalanceAvailable() {
    return typeof this.get('confirmed') === 'number';
  }

  parse(response) {
    // this._setWalletReady(true);
    console.log('we good');

    // Convert from base units
    return {
      confirmed: integerToDecimal(response.confirmed, app.serverConfig.cryptoCurrency),
      unconfirmed: integerToDecimal(response.unconfirmed, app.serverConfig.cryptoCurrency),
    };
  }
}
