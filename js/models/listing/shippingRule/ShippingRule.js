import app from '../../../app';
import Rules from '../../../collections/listing/shippingRules/Rules';
import BaseModel from '../../BaseModel';

export default class extends BaseModel {
  defaults() {
    return {
      ruleType: 'QUANTITY_DISCOUNT',
    };
  }

  get idAttribute() {
    return '_clientID';
  }

  get nested() {
    return {
      rules: Rules,
    };
  }

  get ruleTypes() {
    return [
      'QUANTITY_DISCOUNT',
      'FLAT_FEE_QUANTITY_RANGE',
      'FLAT_FEE_WEIGHT_RANGE',
      'COMBINED_SHIPPING_ADD',
      'COMBINED_SHIPPING_SUBTRACT',
    ];
  }

  validate(attrs) {
    const errObj = {};

    const addError = (fieldName, error) => {
      errObj[fieldName] = errObj[fieldName] || [];
      errObj[fieldName].push(error);
    };

    if (!this.ruleTypes.includes(attrs.ruleType)) {
      addError('ruleType', `The type must be one of ${this.ruleTypes.join(', ')}.`);
    }

    // ensure no rules have overlapping min/maxRanges
    attrs.rules.forEach((rule, i) => {
      if (typeof rule.maxRange === 'number') {
        attrs.rules.slice(i + 1)
          .forEach(furtherRule => {
            if (typeof furtherRule.minRange === 'number' &&
              rule.maxRange >= furtherRule.minRange) {
              addError(`rules[${rule.cid}]`,
                app.polyglot.t('shippingRulesModelErrors.rangeOverlap'));
            }
          });
      }
    });


    if (Object.keys(errObj).length) return errObj;

    return undefined;
  }
}
