'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const vallox = require('../vallox/vallox.js');

function frame(domain, sender, receiver, command, arg) {
    const checksum = (domain + sender + receiver + command + arg) % 256;
    return Buffer.from([domain, sender, receiver, command, arg, checksum]);
}

function decodeOk(buf) {
    let result;
    let error;
    vallox.decode(
        buf,
        (m) => {
            result = m;
        },
        (e) => {
            error = e;
        }
    );
    if (error) throw new Error(error);
    return result;
}

describe('vallox protocol module', function () {
    describe('constants', function () {
        it('exposes the frozen frame constants', function () {
            assert.strictEqual(vallox.constants.VALLOX_LENGTH, 6);
            assert.strictEqual(vallox.constants.VALLOX_DOMAIN, 1);
            assert.strictEqual(vallox.constants.VALLOX_MASTER, 0x11);
            assert.strictEqual(vallox.constants.VALLOX_GET, 'GET');
            assert.strictEqual(vallox.constants.VALLOX_SET, 'SET');
        });
    });

    describe('decode', function () {
        it('decodes the master humidity broadcast from doc Annex B (01 11 20 2a 29 85)', function (t, done) {
            vallox.decode(
                Buffer.from([0x01, 0x11, 0x20, 0x2a, 0x29, 0x85]),
                (msg) => {
                    assert.strictEqual(msg.domain, 0x01);
                    assert.strictEqual(msg.sender, 0x11);
                    assert.strictEqual(msg.receiver, 0x20);
                    assert.strictEqual(msg.command, 0x2a);
                    assert.strictEqual(msg.arg, 0x29);
                    assert.strictEqual(msg.checksum, 0x85);
                    assert.strictEqual(msg.request, 'SET');
                    assert.strictEqual(msg.variable, 'Humidity');
                    done();
                },
                (err) => done(new Error('expected ok, got ' + err))
            );
        });

        it('decodes a GET request by reading the queried register from arg (01 2e 11 00 a3 e3)', function (t, done) {
            vallox.decode(
                Buffer.from([0x01, 0x2e, 0x11, 0x00, 0xa3, 0xe3]),
                (msg) => {
                    assert.strictEqual(msg.request, 'GET');
                    assert.strictEqual(msg.variable, 'Select');
                    assert.strictEqual(msg.value, undefined);
                    done();
                },
                (err) => done(new Error('expected ok, got ' + err))
            );
        });

        it('flags a bad checksum', function (t, done) {
            vallox.decode(
                Buffer.from([0x01, 0x11, 0x20, 0x2a, 0x29, 0x86]),
                () => {
                    done(new Error('expected error'));
                },
                (err) => {
                    assert.match(err, /checksum/i);
                    done();
                }
            );
        });

        it('flags a wrong frame length', function (t, done) {
            vallox.decode(
                Buffer.from([0x01, 0x11, 0x20, 0x2a, 0x29]),
                () => {
                    done(new Error('expected error'));
                },
                (err) => {
                    assert.match(err, /bytes|length/i);
                    done();
                }
            );
        });

        it('flags an empty buffer', function (t, done) {
            vallox.decode(
                undefined,
                () => done(new Error('expected error')),
                (err) => {
                    assert.strictEqual(typeof err, 'string');
                    done();
                }
            );
        });
    });

    describe('encode', function () {
        it('appends the correct checksum for a FanSpeed=5 SET frame', function (t, done) {
            // 0x01 + 0x21 + 0x11 + 0x29 + 0x1f = 0x7b
            vallox.encode(
                { domain: 0x01, sender: 0x21, receiver: 0x11, command: 0x29, arg: 0x1f },
                (bytes) => {
                    assert.deepStrictEqual(Array.from(bytes), [0x01, 0x21, 0x11, 0x29, 0x1f, 0x7b]);
                    done();
                },
                (err) => done(new Error(err))
            );
        });

        it('errors on empty input', function (t, done) {
            vallox.encode(
                undefined,
                () => done(new Error('expected error')),
                (err) => {
                    assert.strictEqual(typeof err, 'string');
                    done();
                }
            );
        });
    });

    describe('round-trip via convert + decode', function () {
        it('FanSpeed 1..8 round-trips', function () {
            for (let speed = 1; speed <= 8; speed++) {
                const { command, arg, readonly } = vallox.convert('FanSpeed', speed);
                assert.strictEqual(readonly, false, 'FanSpeed should not be readonly');
                const decoded = decodeOk(frame(1, 0x21, 0x11, command, arg));
                assert.strictEqual(decoded.variable, 'FanSpeed');
                assert.strictEqual(decoded.value, speed);
            }
        });

        it('HeatingSetPoint round-trips temperatures within +-1 C', function () {
            for (const target of [-10, 0, 5, 15, 20, 25]) {
                const { command, arg } = vallox.convert('HeatingSetPoint', target);
                const decoded = decodeOk(frame(1, 0x21, 0x11, command, arg));
                assert.strictEqual(decoded.variable, 'HeatingSetPoint');
                assert.ok(Math.abs(decoded.value - target) <= 1);
            }
        });

        it('CellDefrostingHysteresis: round(x/3) <-> x*3 round-trips', function () {
            for (const target of [1, 2, 3]) {
                const { arg } = vallox.convert('CellDefrostingHysteresis', target);
                assert.strictEqual(arg, target * 3);
            }
        });
    });

    describe('readonly enforcement matches the protocol doc', function () {
        const writable = [
            'FanSpeed',
            'FanSpeedMax',
            'FanSpeedMin',
            'HeatingSetPoint',
            'PreHeatingSetPoint',
            'InputFanStop',
            'HRCBypass',
            'ServiceReminder',
            'BasicHumidityLevel',
            'DCFanInputAdjustment',
            'DCFanOutputAdjustment',
            'CellDefrostingHysteresis',
            'CO2SetPointUpper',
            'CO2SetPointLower',
            'Program',
            'Program2',
        ];

        const readonlyVars = [
            'TemperatureOutside',
            'TemperatureExhaust',
            'TemperatureInside',
            'TemperatureIncoming',
            'Humidity',
            'CO2High',
            'CO2Low',
            'LastErrorNumber',
            'Flags1',
            'Flags2',
            'Flags6',
            'IoPortFanSpeedRelays',
        ];

        writable.forEach((name) => {
            it(`${name} is writable`, function () {
                assert.strictEqual(vallox.convert(name, 1).readonly, false);
            });
        });

        readonlyVars.forEach((name) => {
            it(`${name} is readonly`, function () {
                assert.strictEqual(vallox.convert(name, 1).readonly, true);
            });
        });
    });

    describe('NTC temperature table (regression spot-checks)', function () {
        function decodeTempByte(byte) {
            return decodeOk(frame(1, 0x11, 0x20, 0x32, byte)).value;
        }

        it('byte 0x00 -> -74 C (table start)', function () {
            assert.strictEqual(decodeTempByte(0x00), -74);
        });

        it('byte 0x64 -> 0 C (zero-Celsius reference)', function () {
            assert.strictEqual(decodeTempByte(0x64), 0);
        });

        it('byte 0xd8 -> 48 C (was 49 before the table fix)', function () {
            assert.strictEqual(decodeTempByte(0xd8), 48);
        });

        it('byte 0xff -> 100 C (table end clamp)', function () {
            assert.strictEqual(decodeTempByte(0xff), 100);
        });
    });

    describe('Flags6 bit positions (regression check)', function () {
        function decodeFlags6(byte) {
            return decodeOk(frame(1, 0x11, 0x20, 0x71, byte)).value;
        }

        it('RemoteMonitoringControl is bit 4 (mask 0x10)', function () {
            assert.strictEqual(decodeFlags6(0x10).RemoteMonitoringControl, true);
            assert.strictEqual(decodeFlags6(0x00).RemoteMonitoringControl, false);
            assert.strictEqual(decodeFlags6(0x08).RemoteMonitoringControl, false);
        });

        it('FirePlaceSwitchActivator is bit 5 (mask 0x20)', function () {
            assert.strictEqual(decodeFlags6(0x20).FirePlaceSwitchActivator, true);
            assert.strictEqual(decodeFlags6(0x10).FirePlaceSwitchActivator, false);
        });

        it('FirePlaceBoosterStatus is bit 6 (mask 0x40)', function () {
            assert.strictEqual(decodeFlags6(0x40).FirePlaceBoosterStatus, true);
            assert.strictEqual(decodeFlags6(0x20).FirePlaceBoosterStatus, false);
        });
    });

    describe('Flags2 (CO2/RH/switch speed requests, alarms)', function () {
        function decodeFlags2(byte) {
            return decodeOk(frame(1, 0x11, 0x20, 0x6d, byte)).value;
        }

        it('CO2 alarm is bit 6 (mask 0x40)', function () {
            assert.strictEqual(decodeFlags2(0x40).CO2Alarm, true);
        });

        it('frost alarm is bit 7 (mask 0x80)', function () {
            assert.strictEqual(decodeFlags2(0x80).FrostAlarm, true);
        });
    });
});
