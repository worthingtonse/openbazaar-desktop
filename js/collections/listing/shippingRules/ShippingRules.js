import { guid } from '../../../utils';
import { Collection } from 'backbone';
import ShippingRule from '../../../models/listing/shippingRule/ShippingRule';

export default class extends Collection {
  model(attrs, options) {
    return new ShippingRule({
      _clientID: attrs._clientID || guid(),
      ...attrs,
    }, options);
  }

  modelId(attrs) {
    return attrs._clientID;
  }
}
