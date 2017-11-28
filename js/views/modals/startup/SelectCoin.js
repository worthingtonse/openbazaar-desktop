import '../../../lib/select2';
import loadTemplate from '../../../utils/loadTemplate';
import BaseModal from '../BaseModal';

export default class extends BaseModal {
  constructor(options = {}) {
    const opts = {
      removeOnClose: true,
      dismissOnEscPress: false,
      showCloseButton: false,
      ...options,
    };

    super(opts);
  }

  className() {
    return `${super.className()} modalScrollPage modalNarrow selectCoin`;
  }

  events() {
    return {
      // 'click .js-cancel': 'onCancelClick',
      ...super.events(),
    };
  }

  render() {
    loadTemplate('modals/startup/selectCoin.html', t => {
      this.$el.html(t({
      }));

      super.render();
      this.$('select').select2();
    });

    return this;
  }
}
