'use strict';

const { expect } = require('chai');
const vallox = require('../vallox/vallox.js');

function frame(domain, sender, receiver, command, arg) {
    const checksum = (domain + sender + receiver + command + arg) % 256;
    return Buffer.from([domain, sender, receiver, command, arg, checksum]);
}

function decodeOk(buf) {
    let result;
    let error;
    vallox.decode(buf, (m) => { result = m; }, (e) => { error = e; });
    if (error) throw new Error(error);
    return result;
}

describe('vallox protocol module', function () {

    describe('constants', function () {
        it('exposes the frozen frame constants', function () {
            expect(vallox.constants.VALLOX_LENGTH).to.equal(6);
            expect(vallox.constants.VALLOX_DOMAIN).to.equal(1);
            expect(vallox.constants.VALLOX_MASTER).to.equal(0x11);
            expect(vallox.constants.VALLOX_GET).to.equal('GET');
            expect(vallox.constants.VALLOX_SET).to.equal('SET');
        });
    });

    describe('decode', function () {
        it('decodes the master humidity broadcast from doc Annex B (01 11 20 2a 29 85)', function (done) {
            vallox.decode(Buffer.from([0x01, 0x11, 0x20, 0x2a, 0x29, 0x85]), (msg) => {
                expect(msg.domain).to.equal(0x01);
                expect(msg.sender).to.equal(0x11);
                expect(msg.receiver).to.equal(0x20);
                expect(msg.command).to.equal(0x2a);
                expect(msg.arg).to.equal(0x29);
                expect(msg.checksum).to.equal(0x85);
                expect(msg.request).to.equal('SET');
                expect(msg.variable).to.equal('Humidity');
                done();
            }, (err) => done(new Error('expected ok, got ' + err)));
        });

        it('decodes a GET request by reading the queried register from arg (01 2e 11 00 a3 e3)', function (done) {
            vallox.decode(Buffer.from([0x01, 0x2e, 0x11, 0x00, 0xa3, 0xe3]), (msg) => {
                expect(msg.request).to.equal('GET');
                expect(msg.variable).to.equal('Select');
                expect(msg.value).to.be.undefined;
                done();
            }, (err) => done(new Error('expected ok, got ' + err)));
        });

        it('flags a bad checksum', function (done) {
            vallox.decode(Buffer.from([0x01, 0x11, 0x20, 0x2a, 0x29, 0x86]), () => {
                done(new Error('expected error'));
            }, (err) => {
                expect(err).to.match(/checksum/i);
                done();
            });
        });

        it('flags a wrong frame length', function (done) {
            vallox.decode(Buffer.from([0x01, 0x11, 0x20, 0x2a, 0x29]), () => {
                done(new Error('expected error'));
            }, (err) => {
                expect(err).to.match(/bytes|length/i);
                done();
            });
        });

        it('flags an empty buffer', function (done) {
            vallox.decode(undefined, () => done(new Error('expected error')),
                (err) => { expect(err).to.be.a('string'); done(); });
        });
    });

    describe('encode', function () {
        it('appends the correct checksum for a FanSpeed=5 SET frame', function (done) {
            // 0x01 + 0x21 + 0x11 + 0x29 + 0x1f = 0x7b
            vallox.encode({ domain: 0x01, sender: 0x21, receiver: 0x11, command: 0x29, arg: 0x1f }, (bytes) => {
                expect(Array.from(bytes)).to.deep.equal([0x01, 0x21, 0x11, 0x29, 0x1f, 0x7b]);
                done();
            }, (err) => done(new Error(err)));
        });

        it('errors on empty input', function (done) {
            vallox.encode(undefined, () => done(new Error('expected error')),
                (err) => { expect(err).to.be.a('string'); done(); });
        });
    });

    describe('round-trip via convert + decode', function () {
        it('FanSpeed 1..8 round-trips', function () {
            for (let speed = 1; speed <= 8; speed++) {
                const { command, arg, readonly } = vallox.convert('FanSpeed', speed);
                expect(readonly, `FanSpeed should not be readonly`).to.equal(false);
                const decoded = decodeOk(frame(1, 0x21, 0x11, command, arg));
                expect(decoded.variable).to.equal('FanSpeed');
                expect(decoded.value).to.equal(speed);
            }
        });

        it('HeatingSetPoint round-trips temperatures within +-1 C', function () {
            for (const target of [-10, 0, 5, 15, 20, 25]) {
                const { command, arg } = vallox.convert('HeatingSetPoint', target);
                const decoded = decodeOk(frame(1, 0x21, 0x11, command, arg));
                expect(decoded.variable).to.equal('HeatingSetPoint');
                expect(decoded.value).to.be.closeTo(target, 1);
            }
        });

        it('CellDefrostingHysteresis: round(x/3) <-> x*3 round-trips', function () {
            for (const target of [1, 2, 3]) {
                const { arg } = vallox.convert('CellDefrostingHysteresis', target);
                expect(arg).to.equal(target * 3);
            }
        });
    });

    describe('readonly enforcement matches the protocol doc', function () {
        const writable = ['FanSpeed', 'FanSpeedMax', 'FanSpeedMin', 'HeatingSetPoint',
                         'PreHeatingSetPoint', 'InputFanStop', 'HRCBypass', 'ServiceReminder',
                         'BasicHumidityLevel', 'DCFanInputAdjustment', 'DCFanOutputAdjustment',
                         'CellDefrostingHysteresis', 'CO2SetPointUpper', 'CO2SetPointLower',
                         'Program', 'Program2'];

        const readonlyVars = ['TemperatureOutside', 'TemperatureExhaust', 'TemperatureInside',
                              'TemperatureIncoming', 'Humidity', 'CO2High', 'CO2Low',
                              'LastErrorNumber', 'Flags1', 'Flags2', 'Flags6',
                              'IoPortFanSpeedRelays'];

        writable.forEach((name) => {
            it(`${name} is writable`, function () {
                expect(vallox.convert(name, 1).readonly).to.equal(false);
            });
        });

        readonlyVars.forEach((name) => {
            it(`${name} is readonly`, function () {
                expect(vallox.convert(name, 1).readonly).to.equal(true);
            });
        });
    });

    describe('NTC temperature table (regression spot-checks)', function () {
        function decodeTempByte(byte) {
            return decodeOk(frame(1, 0x11, 0x20, 0x32, byte)).value;
        }

        it('byte 0x00 -> -74 C (table start)', function () {
            expect(decodeTempByte(0x00)).to.equal(-74);
        });

        it('byte 0x64 -> 0 C (zero-Celsius reference)', function () {
            expect(decodeTempByte(0x64)).to.equal(0);
        });

        it('byte 0xd8 -> 48 C (was 49 before the table fix)', function () {
            expect(decodeTempByte(0xd8)).to.equal(48);
        });

        it('byte 0xff -> 100 C (table end clamp)', function () {
            expect(decodeTempByte(0xff)).to.equal(100);
        });
    });

    describe('Flags6 bit positions (regression check)', function () {
        function decodeFlags6(byte) {
            return decodeOk(frame(1, 0x11, 0x20, 0x71, byte)).value;
        }

        it('RemoteMonitoringControl is bit 4 (mask 0x10)', function () {
            expect(decodeFlags6(0x10).RemoteMonitoringControl).to.equal(true);
            expect(decodeFlags6(0x00).RemoteMonitoringControl).to.equal(false);
            expect(decodeFlags6(0x08).RemoteMonitoringControl).to.equal(false);
        });

        it('FirePlaceSwitchActivator is bit 5 (mask 0x20)', function () {
            expect(decodeFlags6(0x20).FirePlaceSwitchActivator).to.equal(true);
            expect(decodeFlags6(0x10).FirePlaceSwitchActivator).to.equal(false);
        });

        it('FirePlaceBoosterStatus is bit 6 (mask 0x40)', function () {
            expect(decodeFlags6(0x40).FirePlaceBoosterStatus).to.equal(true);
            expect(decodeFlags6(0x20).FirePlaceBoosterStatus).to.equal(false);
        });
    });

    describe('Flags2 (CO2/RH/switch speed requests, alarms)', function () {
        function decodeFlags2(byte) {
            return decodeOk(frame(1, 0x11, 0x20, 0x6d, byte)).value;
        }

        it('CO2 alarm is bit 6 (mask 0x40)', function () {
            expect(decodeFlags2(0x40).CO2Alarm).to.equal(true);
        });

        it('frost alarm is bit 7 (mask 0x80)', function () {
            expect(decodeFlags2(0x80).FrostAlarm).to.equal(true);
        });
    });
});
