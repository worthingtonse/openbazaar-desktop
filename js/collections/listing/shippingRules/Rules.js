import { guid } from '../../../utils';
import { Collection } from 'backbone';
import Rule from '../../../models/listing/shippingRule/Rule';

export default class extends Collection {
  model(attrs, options) {
    return new Rule({
      _clientID: attrs._clientID || guid(),
      ...attrs,
    }, options);
  }

  modelId(attrs) {
    return attrs._clientID;
  }
}
