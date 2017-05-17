import loadTemplate from '../../../utils/loadTemplate';
import BaseVw from '../../baseVw';
import Conversation from '../../chat/Conversation';

export default class extends BaseVw {
  constructor(options = {}) {
    const opts = {
      ...options,
    };

    super(opts);

    if (!this.model) {
      throw new Error('Please provide a model.');
    }

    this.options = opts || {};
  }

  className() {
    return 'discussionTab';
  }

  events() {
    return {
      // 'change .filter input': 'onChangeFilter',
    };
  }

  render() {
    loadTemplate('modals/orderDetail/discussion.html', t => {
      this.$el.html(t({
        ...this.model.toJSON(),
      }));

      // this._$filterCheckboxes = null;

      // if (this.conversation) this.conversation.remove();
      // this.conversation = this.createChild(Conversation, {
        
      // });
    });

    return this;
  }
}
