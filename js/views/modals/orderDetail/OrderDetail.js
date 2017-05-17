import $ from 'jquery';
import app from '../../../app';
import { capitalize } from '../../../utils/string';
import _ from 'underscore';
import loadTemplate from '../../../utils/loadTemplate';
import Case from '../../../models/order/Case';
import Profile from '../../../models/profile/Profile';
import BaseModal from '../BaseModal';
import ProfileBox from './ProfileBox';
import Summary from './Summary';
import Discussion from './Discussion';
import Contract from './Contract';

export default class extends BaseModal {
  constructor(options = {}) {
    const opts = {
      initialState: {
        isFetching: false,
        fetchFailed: false,
        fetchError: '',
      },
      initialTab: 'summary',
      ...options,
    };

    super(opts);
    this._tab = opts.initialTab;
    this.options = opts;
    this.tabViewCache = {};

    if (!this.model) {
      throw new Error('Please provide an Order model.');
    }

    if (typeof opts.getProfiles !== 'function') {
      throw new Error('Please provide a function to retreive profiles.');
    }

    this._state = {
      ...opts.initialState || {},
    };

    this.listenTo(this.model, 'request', this.onOrderRequest);
    this.listenToOnce(this.model, 'sync', this.onFirstOrderSync);
    this.model.fetch();
  }

  className() {
    return `${super.className()} modalScrollPage tabbedModal orderDetail`;
  }

  events() {
    return {
      'click .js-toggleSendReceive': 'onClickToggleSendReceive',
      'click .js-retryFetch': 'onClickRetryFetch',
      'click .js-returnBox': 'onClickReturnBox',
      'click .js-tab': 'onTabClick',
      ...super.events(),
    };
  }

  onOrderRequest(md, xhr) {
    this.setState({
      isFetching: true,
      fetchError: '',
      fetchFailed: false,
    });

    xhr.done(() => {
      this.setState({
        isFetching: false,
        fetchFailed: false,
      });
    }).fail((jqXhr) => {
      if (jqXhr.statusText === 'abort') return;

      let fetchError = '';

      if (jqXhr.responseJSON && jqXhr.responseJSON.reason) {
        fetchError = jqXhr.responseJSON.reason;
      }

      this.setState({
        isFetching: false,
        fetchFailed: true,
        fetchError,
      });
    });
  }

  onFirstOrderSync() {
    this.stopListening(this.model, null, this.onOrderRequest);

    if (this.type === 'case') {
      this.featuredProfileFetch =
        this.model.get('buyerOpened') ? this.buyerProfile : this.vendorProfile;
    } else if (this.type === 'sale') {
      this.featuredProfileFetch = this.buyerProfile;
    } else {
      this.featuredProfileFetch = this.vendorProfile;
    }

    this.featuredProfileFetch.done(profile => {
      this.featuredProfileMd = profile;
      this.featuredProfile.setModel(this.featuredProfileMd);
      this.featuredProfile.setState({
        isFetching: false,
      });
    });
  }

  onClickRetryFetch() {
    this.model.fetch();
  }

  onClickReturnBox() {
    this.close();
  }

  onTabClick(e) {
    const targ = $(e.target).closest('.js-tab');
    this.selectTab(targ.attr('data-tab'));
  }

  get type() {
    return this.model instanceof Case ? 'case' : this.model.type;
  }

  get participantIds() {
    if (!this._participantIds) {
      // For now using flat model data. Once we start on the summary
      // tab, the Order Detail model will likely be built up with
      // nested models and collections.
      const modelData = this.model.toJSON();
      let contract = modelData.contract;

      if (this.type === 'case') {
        contract = modelData.buyerContract;

        if (!modelData.buyerOpened) {
          contract = modelData.vendorContract;
        }
      }

      this._participantIds = {
        buyer: contract.buyerOrder.buyerID.peerID,
        vendor: contract.vendorListings[0].vendorID.peerID,
        moderator: contract.buyerOrder.payment.moderator,
      };
    }

    return this._participantIds;
  }

  get buyerId() {
    return this.participantIds.buyer;
  }

  get vendorId() {
    return this.participantIds.vendor;
  }

  get moderatorId() {
    return this.participantIds.moderator;
  }

  /**
   * Returns a promise that resolves with the buyer's Profile model.
   */
  get buyerProfile() {
    if (!this._buyerProfile) {
      this._buyerProfile = this.options.getProfiles([this.buyerId])[0];
    }

    return this._buyerProfile;
  }

  /**
   * Returns a promise that resolves with the vendor's Profile model.
   */
  get vendorProfile() {
    if (!this._vendorProfile) {
      this._vendorProfile = this.options.getProfiles([this.vendorId])[0];
    }

    return this._vendorProfile;
  }

  /**
   * Returns a promise that resolves with the moderator's Profile model.
   */
  get moderatorProfile() {
    if (!this._moderatorProfile) {
      this._moderatorProfile = this.options.getProfiles([this.moderatorId])[0];
    }

    return this._buyerProfile;
  }

  getState() {
    return this._state;
  }

  setState(state, replace = false) {
    let newState;

    if (replace) {
      this._state = {};
    } else {
      newState = _.extend({}, this._state, state);
    }

    if (!_.isEqual(this._state, newState)) {
      this._state = newState;
      this.render();
    }

    return this;
  }

  selectTab(targ) {
    if (!this[`create${capitalize(targ)}TabView`]) {
      throw new Error(`${targ} is not a valid tab.`);
    }

    let tabView = this.tabViewCache[targ];

    if (!this.currentTabView || this.currentTabView !== tabView) {
      this.$('.js-tab').removeClass('clrT active');
      this.$(`.js-tab[data-tab="${targ}"]`).addClass('clrT active');

      if (this.currentTabView) this.currentTabView.$el.detach();

      if (!tabView) {
        tabView = this[`create${capitalize(targ)}TabView`]();
        this.tabViewCache[targ] = tabView;
        tabView.render();
      }

      this.$tabContent.append(tabView.$el);

      if (typeof tabView.onAttach === 'function') {
        tabView.onAttach.call(tabView);
      }

      this.currentTabView = tabView;
    }
  }

  createSummaryTabView() {
    const view = this.createChild(Summary, {
      model: this.model,
    });

    return view;
  }

  createDiscussionTabView() {
    const conversants = [
      {
        id: this.buyerId,
        data: {
          role: 'buyer',
        },
        profile: this.buyerProfile,
      },
      {
        id: this.vendorId,
        data: {
          role: 'vendor',
        },
        profile: this.vendorProfile,
      },
    ];

    if (this.moderatorId) {
      conversants.push({
        id: this.moderatorId,
        data: {
          role: 'moderator',
        },
        profile: this.moderatorProfile,
      });
    }

    const view = this.createChild(Discussion, {
      model: this.model,
      conversants,
    });

    return view;
  }

  createContractTabView() {
    const view = this.createChild(Contract, {
      model: this.model,
    });

    return view;
  }

  render() {
    loadTemplate('modals/orderDetail/orderDetail.html', t => {
      const state = this.getState();

      this.$el.html(t({
        ...state,
        ...this.model.toJSON(),
        ownProfile: app.profile.toJSON(),
        returnText: this.options.returnText,
        type: this.type,
      }));
      super.render();

      this.$tabContent = this.$('.js-tabContent');

      if (this.featuredProfile) this.featuredProfile.remove();
      this.featuredProfile = this.createChild(ProfileBox, {
        model: this.featuredProfileMd || null,
        initialState: {
          isFetching: this.featuredProfileFetch && this.featuredProfileFetch.state() === 'pending',
        },
      });
      this.$('.js-featuredProfile').html(this.featuredProfile.render().el);

      if (!state.isFetching && !state.fetchError) {
        this.selectTab(this._tab);
      }
    });

    return this;
  }
}
