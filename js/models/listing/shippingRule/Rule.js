import app from '../../../app';
import BaseModel from '../../BaseModel';

export default class extends BaseModel {
  get idAttribute() {
    return '_clientID';
  }

  validate(attrs) {
    const errObj = {};

    const addError = (fieldName, error) => {
      errObj[fieldName] = errObj[fieldName] || [];
      errObj[fieldName].push(error);
    };

    if (attrs.minRange === undefined) {
      addError('minRange', app.polyglot.t('shippingRulesModelErrors.provideMin'));
    } else if (typeof(attrs.minRange) !== 'number') {
      addError('minRange', app.polyglot.t('shippingRulesModelErrors.provideNumericMin'));
    } else if (attrs.minRange < 0) {
      addError('minRange', app.polyglot.t('shippingRulesModelErrors.provideMinZeroOrGreater'));
    }

    if (attrs.maxRange === undefined) {
      addError('maxRange', app.polyglot.t('shippingRulesModelErrors.provideMax'));
    } else if (typeof(attrs.maxRange) !== 'number') {
      addError('maxRange', app.polyglot.t('shippingRulesModelErrors.provideNumericMax'));
    } else if (attrs.maxRange < 0) {
      addError('maxRange', app.polyglot.t('shippingRulesModelErrors.provideMaxZeroOrGreater'));
    }

    if (!errObj.minRange && !!errObj.maxRange) {
      // if both minRange and maxRange are otherwise valid, we'll make sure the min is not
      // greater than the max
      if (attrs.minRange > attrs.maxRange) {
        addError('minRange', app.polyglot.t('shippingRulesModelErrors.minGreaterThanMax'));
      }
    }

    if (attrs.price === undefined) {
      addError('price', app.polyglot.t('shippingRulesModelErrors.providePrice'));
    } else if (typeof(attrs.price) !== 'number') {
      addError('price', app.polyglot.t('shippingRulesModelErrors.provideNumericPrice'));
    } else if (attrs.price < 0) {
      addError('price', app.polyglot.t('shippingRulesModelErrors.providePriceZeroOrGreater'));
    }

    if (Object.keys(errObj).length) return errObj;

    return undefined;
  }
}
