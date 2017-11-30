import { integerToDecimal } from '../../utils/currency';
import app from '../../app';
import BaseModel from '../BaseModel';

export default class extends BaseModel {
  url() {
    return app.getServerUrl('wallet/balance/');
  }

  get isBalanceAvailable() {
    return typeof this.get('confirmed') === 'number';
  }

  set(...args) {
    const isBalanceAvailable = this.isBalanceAvailable;
    super.set(...args);
    if (!isBalanceAvailable && this.isBalanceAvailable) {
      this.trigger('balanceAvailable');
    }
  }

  parse(response) {
    // Convert from base units
    return {
      confirmed: integerToDecimal(response.confirmed, app.serverConfig.cryptoCurrency),
      unconfirmed: integerToDecimal(response.unconfirmed, app.serverConfig.cryptoCurrency),
    };
  }
}
