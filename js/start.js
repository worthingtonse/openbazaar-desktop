import { remote, ipcRenderer } from 'electron';
import $ from 'jquery';
import Backbone from 'backbone';
import Polyglot from 'node-polyglot';
import './lib/whenAll.jquery';
import moment from 'moment';
import app from './app';
import { getCurrencyByCode } from './data/currencies';
import ServerConfigs from './collections/ServerConfigs';
import ServerConfig from './models/ServerConfig';
import serverConnect, {
  events as serverConnectEvents,
  getSocket,
  getCurrentConnection,
} from './utils/serverConnect';
import LocalSettings from './models/LocalSettings';
import ObRouter from './router';
import { getChatContainer, getBody } from './utils/selectors';
import { setFeedbackOptions, addFeedback } from './utils/feedback';
import { showUpdateStatus, updateReady } from './utils/autoUpdate';
import Chat from './views/chat/Chat.js';
import ChatHeads from './collections/ChatHeads';
import PageNav from './views/PageNav.js';
import LoadingModal from './views/modals/Loading';
import StartupLoadingModal from './views/modals/StartupLoading';
import { openSimpleMessage } from './views/modals/SimpleMessage';
import Dialog from './views/modals/Dialog';
import StatusBar from './views/StatusBar';
import { getTranslationLangByCode } from './data/languages';
import Profile from './models/profile/Profile';
import Settings from './models/Settings';
import WalletBalance from './models/wallet/WalletBalance';
import Followers from './collections/Followers';
import { fetchExchangeRates } from './utils/currency';
import './utils/exchangeRateSyncer';
import './utils/listingData';
import { launchDebugLogModal, launchSettingsModal } from './utils/modalManager';
import listingDeleteHandler from './startup/listingDelete';
import { fixLinuxZoomIssue, handleLinks } from './startup';
import ConnectionManagement from './views/modals/connectionManagement/ConnectionManagement';
import Onboarding from './views/modals/onboarding/Onboarding';
import SearchProvidersCol from './collections/search/SearchProviders';
import defaultSearchProviders from './data/defaultSearchProviders';

fixLinuxZoomIssue();

app.localSettings = new LocalSettings({ id: 1 });
app.localSettings.fetch().fail(() => app.localSettings.save());

// initialize language functionality
function getValidLanguage(lang) {
  if (getTranslationLangByCode(lang)) {
    return lang;
  }

  return 'en_US';
}

const initialLang = getValidLanguage(app.localSettings.get('language'));
app.localSettings.set('language', initialLang);
moment.locale(initialLang);
app.polyglot = new Polyglot();
app.polyglot.extend(require(`./languages/${initialLang}.json`));

app.localSettings.on('change:language', (localSettings, lang) => {
  app.polyglot.extend(
    require(`./languages/${lang}.json`)); // eslint-disable-line global-require

  moment.locale(lang);

  const restartLangChangeDialog = new Dialog({
    title: app.polyglot.t('langChangeRestartTitle'),
    message: app.polyglot.t('langChangeRestartMessage'),
    buttons: [{
      text: app.polyglot.t('restartNow'),
      fragment: 'restartNow',
    }, {
      text: app.polyglot.t('restartLater'),
      fragment: 'restartLater',
    }],
  }).on('click-restartNow', () => location.reload())
  .on('click-restartLater', () => restartLangChangeDialog.close())
  .render()
  .open();
});

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  ipcRenderer.send('contextmenu-click');
}, false);

// Instantiating our Server Configs collection now since the page nav
// utilizes it. We'll fetch it later on.
app.serverConfigs = new ServerConfigs();

app.pageNav = new PageNav({
  serverConfigs: app.serverConfigs,
});
$('#pageNavContainer').append(app.pageNav.render().el);

app.router = new ObRouter();

// create our status bar view
app.statusBar = new StatusBar();
$('#statusBar').html(app.statusBar.render().el);

// Create and launch a startup loading modal which will be
// used during the startup connecting process.
const startupLoadingModal = new StartupLoadingModal({
  dismissOnOverlayClick: false,
  dismissOnEscPress: false,
  showCloseButton: false,
}).render().open();

// Create loading modal, which is a shared instance used by
// the app after the initial connect sequence
app.loadingModal = new LoadingModal({
  dismissOnOverlayClick: false,
  dismissOnEscPress: false,
  showCloseButton: false,
  removeOnRoute: false,
}).render();

handleLinks();

// add the feedback mechanism
addFeedback();

const fetchConfigDeferred = $.Deferred();

function fetchConfig() {
  $.get(app.getServerUrl('ob/config')).done((...args) => {
    fetchConfigDeferred.resolve(...args);
  }).fail(xhr => {
    const retryConfigDialog = new Dialog({
      title: app.polyglot.t('startUp.dialogs.retryConfig.title'),
      message: xhr && xhr.responseJSON && xhr.responseJSON.reason ||
        xhr.responseText || '',
      buttons: [
        {
          text: app.polyglot.t('startUp.dialogs.btnRetry'),
          fragment: 'retry',
        },
        {
          text: app.polyglot.t('startUp.dialogs.btnManageConnections'),
          fragment: 'manageConnections',
        },
      ],
      dismissOnOverlayClick: false,
      dismissOnEscPress: false,
      showCloseButton: false,
    }).on('click-retry', () => {
      retryConfigDialog.close();

      // slight of hand to ensure the loading modal has a chance to at
      // least briefly show before another potential failure
      setTimeout(() => {
        fetchConfig();
      }, 300);
    }).on('click-manageConnections', () =>
      app.connectionManagmentModal.open())
    .render()
    .open();
  });

  return fetchConfigDeferred.promise();
}

const onboardingNeededDeferred = $.Deferred();
let profileFetch;
let settingsFetch;
let onboardProfile = false;
let onboardSettings = false;
let profileFailed;
let settingsFailed;

function isOnboardingNeeded() {
  profileFetch = !profileFetch || profileFailed ?
    app.profile.fetch() : profileFetch;
  settingsFetch = !settingsFetch || settingsFailed ?
    app.settings.fetch() : settingsFetch;

  $.whenAll(profileFetch, settingsFetch)
    .progress((...args) => {
      const state = args[1];

      if (state !== 'success') {
        const jqXhr = args[0];

        if (jqXhr === profileFetch) {
          if (jqXhr.status === 404) {
            onboardProfile = true;
            profileFailed = false;
          } else {
            profileFailed = true;
          }
        } else if (jqXhr === settingsFetch) {
          if (jqXhr.status === 404) {
            onboardSettings = true;
            settingsFailed = false;
          } else {
            settingsFailed = true;
          }
        }
      }
    })
    .done(() => {
      onboardingNeededDeferred.resolve(false);
    })
    .fail((xhr, e) => {
      const jqXhr = xhr && xhr.length ? xhr[0] : xhr || e;

      if (profileFailed || settingsFailed) {
        const retryOnboardingModelsDialog = new Dialog({
          title: app.polyglot.t('startUp.dialogs.retryOnboardingFetch.title'),
          message: jqXhr.responseJSON && jqXhr.responseJSON.reason || '',
          buttons: [
            {
              text: app.polyglot.t('startUp.dialogs.btnRetry'),
              fragment: 'retry',
            },
            {
              text: app.polyglot.t('startUp.dialogs.btnManageConnections'),
              fragment: 'manageConnections',
            },
          ],
          dismissOnOverlayClick: false,
          dismissOnEscPress: false,
          showCloseButton: false,
        }).on('click-retry', () => {
          retryOnboardingModelsDialog.close();

          // slight of hand to ensure the loading modal has a chance to at
          // least briefly show before another potential failure
          setTimeout(() => {
            isOnboardingNeeded();
          }, 300);
        }).on('click-manageConnections', () =>
          app.connectionManagmentModal.open())
        .render()
        .open();
      } else if (onboardProfile || onboardSettings) {
        onboardingNeededDeferred.resolve(true);
      }
    });

  return onboardingNeededDeferred.promise();
}

const onboardDeferred = $.Deferred();

function onboard() {
  const onboarding = new Onboarding()
    .render()
    .open();

  onboarding.on('onboarding-complete', () => {
    location.hash = `${app.profile.id}/home`;
    onboardDeferred.resolve();
    onboarding.remove();
  });

  return onboardDeferred.promise();
}

const fetchStartupDataDeferred = $.Deferred();
let ownFollowingFetch;
let ownFollowingFailed;
let exchangeRatesFetch;
let walletBalanceFetch;
let walletBalanceFetchFailed;
let searchProvidersFetch;
let searchProvidersFetchFailed;

function fetchStartupData() {
  ownFollowingFetch = !ownFollowingFetch || ownFollowingFailed ?
    app.ownFollowing.fetch() : ownFollowingFetch;
  exchangeRatesFetch = exchangeRatesFetch || fetchExchangeRates();
  walletBalanceFetch = !walletBalanceFetch || walletBalanceFetchFailed ?
    app.walletBalance.fetch() : walletBalanceFetch;
  searchProvidersFetch = !searchProvidersFetch || searchProvidersFetchFailed ?
    app.searchProviders.fetch() : searchProvidersFetch;

  $.whenAll(ownFollowingFetch, exchangeRatesFetch, walletBalanceFetch, searchProvidersFetch)
    .progress((...args) => {
      const state = args[1];

      if (state !== 'success') {
        const jqXhr = args[0];

        if (jqXhr === ownFollowingFetch) {
          ownFollowingFailed = true;
        } else if (jqXhr === walletBalanceFetch) {
          walletBalanceFetchFailed = true;
        } else if (jqXhr === searchProvidersFetch) {
          searchProvidersFetchFailed = true;
        }
      }
    })
    .done(() => {
      fetchStartupDataDeferred.resolve();
    })
    .fail((jqXhr) => {
      // if (ownFollowingFailed || walletBalanceFetchFailed || searchProvidersFetchFailed) {
      if (ownFollowingFailed || searchProvidersFetchFailed) {
        let title = '';

        if (ownFollowingFailed) {
          title = app.polyglot.t('startUp.dialogs.unableToGetFollowData.title');
        // } else if (walletBalanceFetchFailed) {
        //   title = app.polyglot.t('startUp.dialogs.unableToGetWalletBalance.title');
        } else {
          title = app.polyglot.t('startUp.dialogs.unableToGetSearchProviders.title');
        }

        const retryFetchStarupDataDialog = new Dialog({
          title,
          message: jqXhr.responseJSON && jqXhr.responseJSON.reason || '',
          buttons: [
            {
              text: app.polyglot.t('startUp.dialogs.btnRetry'),
              fragment: 'retry',
            },
            {
              text: app.polyglot.t('startUp.dialogs.btnManageConnections'),
              fragment: 'manageConnections',
            },
          ],
          dismissOnOverlayClick: false,
          dismissOnEscPress: false,
          showCloseButton: false,
        }).on('click-retry', () => {
          retryFetchStarupDataDialog.close();

          // slight of hand to ensure the loading modal has a chance to at
          // least briefly show before another potential failure
          setTimeout(() => fetchStartupData(), 300);
        }).on('click-manageConnections', () =>
          app.connectionManagmentModal.open())
        .render()
        .open();
      } else {
        // We don't care if the exchange rate or wallet balance fetches fail, because
        // the app is designed to gracefully handle that and systems are in place to get
        // the data later.
        fetchStartupDataDeferred.resolve();
      }
    });

  return fetchStartupDataDeferred.promise();
}

const onboardIfNeededDeferred = $.Deferred();

function onboardIfNeeded() {
  isOnboardingNeeded().done((onboardingNeeded) => {
    if (onboardingNeeded) {
      // let's go onboard
      onboard().done(() => onboardIfNeededDeferred.resolve());
    } else {
      onboardIfNeededDeferred.resolve();
    }
  });

  return onboardIfNeededDeferred.promise();
}

function isCryptoCurrencySupported(cryptoCurrency) {
  return !!getCurrencyByCode(cryptoCurrency);
}

let ensureValidSettingsCurDeferred;

function ensureValidSettingsCurrency() {
  if (!ensureValidSettingsCurDeferred) {
    ensureValidSettingsCurDeferred = $.Deferred();
  } else {
    return ensureValidSettingsCurDeferred.promise();
  }

  const settingsCur = app.settings.get('localCurrency');
  const dialogTitle = app.polyglot.t('setValidCurDialog.title');
  const settingsLink =
    '<button class="btnAsLink js-setCurSettings clrTEm">' +
      `${app.polyglot.t('setValidCurDialog.settingsLink')}` +
      '</button>';
  const dialogBody = currency => (
    app.polyglot.t('setValidCurDialog.body', {
      currency,
      settingsLink,
    })
  );

  if (!getCurrencyByCode(settingsCur)) {
    const setValidCurDialog = openSimpleMessage(
      dialogTitle,
      dialogBody(settingsCur), {
        dismissOnEscPress: false,
        showCloseButton: false,
      }
    );

    let settingsModal;

    const bindSetCurSettingsHandler = () => {
      setValidCurDialog.$('.js-setCurSettings')
        .on('click', () =>
          (settingsModal = launchSettingsModal({ initialTab: 'General' })));
    };

    bindSetCurSettingsHandler();

    const onCurChange = (md, cur) => {
      if (getCurrencyByCode(cur)) {
        settingsModal.close();
        setValidCurDialog.close();
        ensureValidSettingsCurDeferred.resolve();
      } else {
        setValidCurDialog.open(dialogTitle, dialogBody(cur));
        bindSetCurSettingsHandler();
        settingsModal.close();
      }
    };

    app.settings.on('change:localCurrency', onCurChange);
  } else {
    ensureValidSettingsCurDeferred.resolve();
  }

  return ensureValidSettingsCurDeferred.promise();
}

 // let's start our flow - do we need onboarding?,
 // fetching app-wide models...
function start() {
  fetchConfig().done((data) => {
    // This is the server config as returned by ob/config. It has nothing to do with
    // app.serverConfigs which is a collection of server configuration data related
    // to connecting with a server. The latter is stored in local storage.
    app.serverConfig = data || {};

    if (!isCryptoCurrencySupported(app.serverConfig.cryptoCurrency)) {
      const connectLink =
        '<button class="btnAsLink js-connect clrTEm">' +
          `${app.polyglot.t('unsupportedCryptoCurDialog.connectLink')}` +
          '</button>';

      const unsupportedCryptoCurDialog = openSimpleMessage(
        app.polyglot.t('unsupportedCryptoCurDialog.title'),
        app.polyglot.t('unsupportedCryptoCurDialog.body', {
          curCode: app.serverConfig.cryptoCurrency,
          connectLink,
        }),
        {
          dismissOnEscPress: false,
          showCloseButton: false,
        }
      );

      unsupportedCryptoCurDialog.$('.js-connect')
        .on('click', () => app.connectionManagmentModal.open());

      serverConnectEvents.once('connected', () => unsupportedCryptoCurDialog.remove());

      return;
    }

    app.profile = new Profile({ peerID: data.peerID });
    app.router.onProfileSet();
    app.settings = new Settings();

    const curConn = getCurrentConnection();

    if (curConn && curConn.status !== 'disconnected') {
      app.pageNav.torIndicatorOn = app.serverConfig.tor && curConn.server.get('useTor');
    }

    app.ownFollowing = new Followers([], {
      type: 'following',
      peerId: app.profile.id,
    });

    app.walletBalance = new WalletBalance();

    app.searchProviders = new SearchProvidersCol();

    onboardIfNeeded().done(() => {
      fetchStartupData().done(() => {
        ensureValidSettingsCurrency().done(() => {
          app.pageNav.navigable = true;
          app.pageNav.setAppProfile();
          app.loadingModal.close();

          // add the default search providers
          app.searchProviders.add(defaultSearchProviders, { at: 0 });

          // set the profile data for the feedback mechanism
          setFeedbackOptions();

          const externalRoute = remote.getGlobal('externalRoute');

          if (externalRoute) {
            // handle opening the app from an an external ob link
            location.hash = `#${externalRoute}`;
          } else if (!location.hash) {
            // If for some reason the route to start on is empty, we'll change it to be
            // the user's profile.
            const href = location.href.replace(/(javascript:|#).*$/, '');
            location.replace(`${href}#${app.profile.id}`);
          }

          Backbone.history.start();

          // load chat
          const chatConvos = new ChatHeads();

          chatConvos.once('request', (cl, xhr) => {
            xhr.always(() => app.chat.attach(getChatContainer()));
          });

          app.chat = new Chat({
            collection: chatConvos,
            $scrollContainer: getChatContainer(),
          });

          chatConvos.fetch();
          $('#chatCloseBtn').on('click', () => (app.chat.close()));

          getChatContainer()
              .on('mouseenter', () => getBody().addClass('chatHover'))
              .on('mouseleave', () => getBody().removeClass('chatHover'));

          // have our walletBalance model update from the walletUpdate socket event
          const serverSocket = getSocket();

          if (serverSocket) {
            let moo = 0;
            serverSocket.on('message', (e = {}) => {
              if (e.jsonData.walletUpdate) {
                moo += 1;
                // if (moo < 2) return;
                const parsedData = app.walletBalance.parse({
                  confirmed: e.jsonData.walletUpdate.confirmed,
                  unconfirmed: e.jsonData.walletUpdate.unconfirmed,
                });

                app.walletBalance.set(parsedData);
              }
            });
          }
        });
      });
    });
  });
}

function connectToServer() {
  const server = app.serverConfigs.activeServer;
  let connectAttempt = null;

  startupLoadingModal
    .setState({
      msg: app.polyglot.t('startUp.startupLoadingModal.connectAttemptMsg', {
        serverName: server.get('name'),
        canceLink: '<a class="js-cancel delayBorder">' +
          `${app.polyglot.t('startUp.startupLoadingModal.canceLink')}</a>`,
      }),
      // There's a weird issue where the first time we render a message, it renders the
      // underline for the link first and then after a brief delay, the text after it. Looks
      // tacky, so to avoid it, we'll fade in the message.
      msgClass: 'fadeInAnim',
    }).on('clickCancel', () => {
      connectAttempt.cancel();
      app.connectionManagmentModal.open();
      startupLoadingModal.close();
    });

  connectAttempt = serverConnect(app.serverConfigs.activeServer)
    .done(() => {
      startupLoadingModal.close();
      app.loadingModal.open();
      start();
    })
    .fail(() => {
      app.connectionManagmentModal.open();
      startupLoadingModal.close();
      serverConnectEvents.once('connected', () => {
        app.loadingModal.open();
        start();
      });
    });
}

// Handle a server connection event.
let connectedAtLeastOnce = false;

serverConnectEvents.on('connected', () => {
  app.connectionManagmentModal.setModalOptions({
    dismissOnEscPress: true,
    showCloseButton: true,
  });

  if (connectedAtLeastOnce) {
    location.reload();
  } else {
    connectedAtLeastOnce = true;
    app.connectionManagmentModal.close();
    if (app.chat) app.chat.show();
  }
});

// Handle a lost connection.
serverConnectEvents.on('disconnected', () => {
  app.connectionManagmentModal.setModalOptions({
    dismissOnOverlayClick: false,
    dismissOnEscPress: false,
    showCloseButton: false,
  });

  if (app.chat) {
    app.chat.close();
    app.chat.hide();
  }

  app.pageNav.navigable = false;
  app.connectionManagmentModal.open();
});

// If we have a connection, close the Connection Management modal on a
// will-route event.
const onWillRouteCloseConnModal =
  () => app.connectionManagmentModal.close();
serverConnectEvents.on('connected', () =>
  app.router.on('will-route', onWillRouteCloseConnModal));
serverConnectEvents.on('disconnected', () =>
  app.router.off('will-route', onWillRouteCloseConnModal));


const sendMainActiveServer = (activeServer) => {
  ipcRenderer.send('active-server-set', {
    ...activeServer.toJSON(),
    httpUrl: activeServer.httpUrl,
    socketUrl: activeServer.socketUrl,
    authenticate: activeServer.needsAuthentication(),
  });
};

// Alert the main process if we are changing the active server.
app.serverConfigs.on('activeServerChange', (activeServer) =>
  sendMainActiveServer(activeServer));

// Let's create our Connection Management modal so that it's
// available to show when needed.
app.connectionManagmentModal = new ConnectionManagement({
  removeOnRoute: false,
  dismissOnOverlayClick: false,
  dismissOnEscPress: false,
  showCloseButton: false,
}).render();

// get the saved server configurations
app.serverConfigs.fetch().done(() => {
  if (!app.serverConfigs.length) {
    // no saved server configurations
    if (remote.getGlobal('isBundledApp')) {
      // for a bundled app, we'll create a
      // "default" one and try to connect
      const defaultConfig = new ServerConfig({
        name: app.polyglot.t('connectionManagement.defaultServerName'),
        default: true,
      });

      const save = defaultConfig.save();

      if (save) {
        save.done(() => {
          app.serverConfigs.add(defaultConfig);
          app.serverConfigs.activeServer = defaultConfig;
          connectToServer();
        });
      } else {
        const validationErr = defaultConfig.validationError;

        // This is developer error.
        throw new Error('There were one or more errors saving the default server configuration' +
          `${Object.keys(validationErr).map(key => `\n- ${validationErr[key]}`)}`);
      }
    } else {
      app.connectionManagmentModal.open();
      serverConnectEvents.once('connected', () => {
        app.loadingModal.open();
        start();
      });
    }
  } else {
    let activeServer = app.serverConfigs.activeServer;

    if (activeServer) {
      sendMainActiveServer(activeServer);
    } else {
      activeServer = app.serverConfigs.activeServer = app.serverConfigs.at(0);
    }

    if (activeServer.get('default') && !remote.getGlobal('isBundledApp')) {
      // Your active server is the locally bundled server, but you're
      // not running the bundled app. You have bad data!
      activeServer.set('default', false);
    }

    connectToServer();
  }
});

// Clear localServer events on browser refresh.
$(window).on('beforeunload', () => {
  const localServer = remote.getGlobal('localServer');

  if (localServer) {
    // Since on a refresh any browser variables go away,
    // we need to unbind our handlers from the localServer instance.
    // Otherwise, since that instance lives in the main process
    // and continues to live beyond a refresg, the app would crash
    // when a localServer event is triggered for any of those handlers.
    localServer.off();

    // Let the main process know we've just blown away all the handlers,
    // since some of them may be main process callbacks that the main
    // process may want to revive.
    ipcRenderer.send('renderer-cleared-local-server-events');
  }
});

// Handle 'show debug log' requests from the main process.
ipcRenderer.on('show-server-log', () => launchDebugLogModal());

// Handle update events from main.js
ipcRenderer.on('updateChecking', () =>
  showUpdateStatus(app.polyglot.t('update.checking')));
ipcRenderer.on('updateAvailable', () =>
  showUpdateStatus(app.polyglot.t('update.available')));
ipcRenderer.on('updateNotAvailable', () =>
  showUpdateStatus(app.polyglot.t('update.notAvailable')));
ipcRenderer.on('updateError', (e, msg) =>
  showUpdateStatus(app.polyglot.t('update.error', { error: msg }), 'warning'));
ipcRenderer.on('updateReadyForInstall', (e, opts) => updateReady(opts));

// Allow main.js to send messages to the console
ipcRenderer.on('consoleMsg', (e, msg) => console.log(msg));

// manage publishing sockets
// todo: break the publishing socket startup functionality
// into its own micro-module in js/startup/
let publishingStatusMsg;
let publishingStatusMsgRemoveTimer;
let unpublishedContent = false;
let retryPublishTimeout;

function setPublishingStatus(msg) {
  if (!msg && typeof msg !== 'object') {
    throw new Error('Please provide a msg as an object.');
  }

  msg.duration = 99999999999999;
  clearTimeout(retryPublishTimeout);

  if (!publishingStatusMsg) {
    publishingStatusMsg = app.statusBar.pushMessage({
      ...msg,
    });
    publishingStatusMsg.on('clickRetry', () => {
      setPublishingStatus({
        msg: app.polyglot.t('publish.statusPublishing'),
        type: 'message',
      });

      // some fake latency so if the rety fails immediately, the UI has a chance
      // to update
      clearTimeout(retryPublishTimeout);
      retryPublishTimeout = setTimeout(() => {
        $.post(app.getServerUrl('ob/publish'))
          .fail(jqXhr => {
            setPublishingStatus({
              msg: app.polyglot.t('publish.statusPublishFailed', {
                retryLink: `<a class="js-retry">${app.polyglot.t('publish.retryLink')}</a>`,
              }),
              type: 'warning',
            });

            const failReason = jqXhr.responseJSON && jqXhr.responseJSON.reason || '';
            openSimpleMessage(
              app.polyglot.t('publish.failedRetryTitle'),
              failReason
            );
          });
      }, 500);
    });
  } else {
    clearTimeout(publishingStatusMsgRemoveTimer);
    publishingStatusMsg.update(msg);
  }

  return publishingStatusMsg;
}

serverConnectEvents.on('connected', (connectedEvent) => {
  connectedEvent.socket.on('message', (e) => {
    if (e.jsonData) {
      if (e.jsonData.status === 'publishing') {
        setPublishingStatus({
          msg: app.polyglot.t('publish.statusPublishing'),
          type: 'message',
        });

        unpublishedContent = true;
      } else if (e.jsonData.status === 'error publishing') {
        setPublishingStatus({
          msg: app.polyglot.t('publish.statusPublishFailed', {
            retryLink: `<a class="js-retry">${app.polyglot.t('publish.retryLink')}</a>`,
          }),
          type: 'warning',
        });

        unpublishedContent = true;
      } else if (e.jsonData.status === 'publish complete') {
        setPublishingStatus({
          msg: app.polyglot.t('publish.statusPublishComplete'),
          type: 'message',
        });

        unpublishedContent = false;

        publishingStatusMsgRemoveTimer = setTimeout(() => {
          publishingStatusMsg.remove();
          publishingStatusMsg = null;
        }, 3000);
      }
    }
  });
});

let unpublishedConfirm;

ipcRenderer.on('close-attempt', (e) => {
  if (!unpublishedContent) {
    e.sender.send('close-confirmed');
  } else {
    if (unpublishedConfirm) return;

    unpublishedConfirm = new Dialog({
      title: app.polyglot.t('publish.unpublishedConfirmTitle'),
      message: app.polyglot.t('publish.unpublishedConfirmBody'),
      buttons: [{
        text: app.polyglot.t('publish.unpublishedConfirmYes'),
        fragment: 'yes',
      }, {
        text: app.polyglot.t('publish.unpublishedConfirmNo'),
        fragment: 'no',
      }],
      dismissOnOverlayClick: false,
      dismissOnEscPress: false,
      showCloseButton: false,
    }).on('click-yes', () => e.sender.send('close-confirmed'))
    .on('click-no', () => {
      unpublishedConfirm.close();
      unpublishedConfirm = null;
    })
    .render()
    .open();
  }
});

// initialize our listing delete handler
listingDeleteHandler();

if (remote.getGlobal('isBundledApp')) {
  console.log(`%c${app.polyglot.t('consoleWarning.heading')}`,
    'color: red; font-weight: bold; font-size: 50px;');
  console.log(`%c${app.polyglot.t('consoleWarning.line1')}`, 'color: red;');
  console.log(`%c${app.polyglot.t('consoleWarning.line2')}`, 'color: blue;');
}
