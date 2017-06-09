import app from '../../../app';
import BaseModel from '../../BaseModel';

export default class extends BaseModel {
  defaults() {
    return {
      url: '',
      password: '',
    };
  }

  validate(attrs) {
    const errObj = {};
    const addError = (fieldName, error) => {
      errObj[fieldName] = errObj[fieldName] || [];
      errObj[fieldName].push(error);
    };

    if (!attrs.url || (typeof attrs.url === 'string' && !attrs.url.trim())) {
      addError('url', app.polyglot.t('orderFulfillmentModelErrors.provideUrl'));
    }

    if (Object.keys(errObj).length) return errObj;

    return undefined;
  }
}
