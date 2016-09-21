'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _util = require('util');

var _util2 = _interopRequireDefault(_util);

var _EsClient = require('./EsClient');

var _EsClient2 = _interopRequireDefault(_EsClient);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var EVENT_STORE_UTILS_RETRIES_COUNT = process.env.EVENT_STORE_UTILS_RETRIES_COUNT || 10;

var EventStoreUtils = function () {
  function EventStoreUtils() {
    var _ref = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    var _ref$apiKey = _ref.apiKey;
    var apiKey = _ref$apiKey === undefined ? {} : _ref$apiKey;

    _classCallCheck(this, EventStoreUtils);

    if (!apiKey.id) {
      apiKey.id = process.env.EVENTUATE_API_KEY_ID || process.env.EVENT_STORE_USER_ID;
    }

    if (!apiKey.secret) {
      apiKey.secret = process.env.EVENTUATE_API_KEY_SECRET || process.env.EVENT_STORE_PASSWORD;
    }

    if (!apiKey.id || !apiKey.secret) {
      throw new Error('Use `EVENTUATE_API_KEY_ID` and `EVENTUATE_API_KEY_SECRET` to set Event Store auth data');
    }

    var esClientOpts = {
      apiKey: apiKey,
      httpKeepAlive: true,
      spaceName: process.env.EVENTUATE_SPACE_NAME || process.env.EVENT_STORE_SPACE_NAME
    };

    this.esClient = new _EsClient2.default(esClientOpts);

    this.updateEntity = this.retryNTimes(EVENT_STORE_UTILS_RETRIES_COUNT, function (EntityClass, entityId, command, callback) {
      var entity = new EntityClass(),
          self = this;

      self.esClient.loadEvents(entity.entityTypeName, entityId, function (err, loadedEvents) {
        if (err) {
          callback(err);
        } else {

          if (loadedEvents.length > 0) {

            var entityVersion = loadedEvents[loadedEvents.length - 1].id;

            //iterate through the events calling entity.applyEvent(..)
            for (var prop in loadedEvents) {

              if (Object.prototype.hasOwnProperty.call(loadedEvents, prop)) {

                var event = loadedEvents[prop];

                var type = event.eventType.split('.').pop();

                var applyMethod = self.getApplyMethod(entity, type);

                applyMethod.call(entity, event);
              }
            }

            var processCommandMethod = self.getProcessCommandMethod(entity, command.commandType);

            var events = processCommandMethod.call(entity, command);

            self.esClient.update(entity.entityTypeName, entityId, entityVersion, events, function (error, updatedEntityAndEventInfo) {
              if (error) {
                callback(error);
                return;
              }

              callback(null, updatedEntityAndEventInfo);
            });
          } else {
            callback(new Error('Can not get entityVersion: no events for ' + entity.entityTypeName + ' ' + entityId));
          }
        }
      });
    }, function (err) {
      return err && err.statusCode === 409;
    });
  }

  _createClass(EventStoreUtils, [{
    key: 'retryNTimes',
    value: function retryNTimes(times, fn, _errConditionFn, ctx) {

      var errConditionFn = void 0;
      if (typeof _errConditionFn !== 'function') {
        ctx = _errConditionFn;
        errConditionFn = function errConditionFn(err) {
          return err;
        };
      } else {
        errConditionFn = _errConditionFn;
      }

      return function () {
        var count = times;
        var innerCtx = this || ctx;

        var args = [].slice.call(arguments);
        var worker = function worker() {
          fn.apply(innerCtx, args);
        };

        var oldCb = args.pop();
        if (typeof oldCb !== 'function') {
          throw new TypeError('Last parameter is expected to be a function');
        }
        args.push(function (err, result) {
          if (errConditionFn(err, result)) {
            count--;
            if (count) {
              console.log('retryNTimes ' + count + ' - ' + args[1] + ' - ' + _util2.default.inspect(args[2]));
              setTimeout(worker, 100);
            } else {
              oldCb(err, result);
            }
          } else {
            oldCb(err, result);
          }
        });

        worker();
      };
    }
  }, {
    key: 'createEntity',
    value: function createEntity(EntityClass, command, callback) {

      var entity = new EntityClass();

      var processCommandMethod = this.getProcessCommandMethod(entity, command.commandType);

      var events = processCommandMethod.call(entity, command);

      this.esClient.create(entity.entityTypeName, events, function (err, createdEntityAndEventInfo) {
        if (err) {
          callback(err);
          return;
        }

        callback(null, createdEntityAndEventInfo);
      });
    }
  }, {
    key: 'loadEvents',
    value: function loadEvents(entityTypeName, entityId, callback) {

      this.esClient.loadEvents(entityTypeName, entityId, function (err, loadedEvents) {
        if (err) {
          callback(err);
          return;
        }

        callback(null, loadedEvents);
      });
    }
  }, {
    key: 'getApplyMethod',
    value: function getApplyMethod(entity, eventType) {

      var defaultMethod = 'applyEvent';
      var methodName = 'apply' + eventType;

      if (typeof entity[methodName] == 'function') {

        return entity[methodName];
      } else if (typeof entity[defaultMethod] == 'function') {

        return entity[defaultMethod];
      } else {

        throw new Error('Entity does not have method to ' + prefix + ' for ' + eventType + ': ');
      }
    }
  }, {
    key: 'getProcessCommandMethod',
    value: function getProcessCommandMethod(entity, commandType) {

      var defaultMethod = 'processCommand';
      var methodName = 'process' + commandType;

      if (typeof entity[methodName] == 'function') {

        return entity[methodName];
      } else if (typeof entity[defaultMethod] == 'function') {

        return entity[defaultMethod];
      } else {

        throw new Error('Entity does not have method to ' + prefix + ' for ' + commandType + ': ');
      }
    }
  }]);

  return EventStoreUtils;
}();

exports.default = EventStoreUtils;
module.exports = exports['default'];