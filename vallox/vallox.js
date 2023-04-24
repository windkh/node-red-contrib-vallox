// Functions for decoding and encoding RS485 vallox protocol.
// Ported from https://github.com/windkh/valloxserial

'use strict';

const Constants = {
    VALLOX_LENGTH : 6, // always 6
    VALLOX_DOMAIN : 1, // always 1
    VALLOX_MASTER : 0x11, // always 0x10 + 1
    VALLOX_GET : 'GET',
    VALLOX_SET : 'SET',
};

const Variables = {
    GET : 0x00, // command to get a variable
    
    // 1 1 1 1 1 1 1 1  
    // | | | | | | | |
    // | | | | | | | +- 0 Speed 1 - 0=0ff 1=on - readonly
    // | | | | | | +--- 1 Speed 2 - 0=0ff 1=on - readonly
    // | | | | | +----- 2 Speed 3 - 0=0ff 1=on - readonly
    // | | | | +------- 3 Speed 4 - 0=0ff 1=on - readonly
    // | | | +--------- 4 Speed 5 - 0=0ff 1=on - readonly
    // | | +----------- 5 Speed 6 - 0=0ff 1=on - readonly
    // | +------------- 6 Speed 7 - 0=0ff 1=on - readonly
    // +--------------- 7 Speed 8 - 0=0ff 1=on - readonly
    IOPORT_FANSPEED_RELAYS : 0x06,

    // 1 1 1 1 1 1 1 1 
    // | | | | | | | |
    // | | | | | | | +- 0 
    // | | | | | | +--- 1 
    // | | | | | +----- 2 
    // | | | | +------- 3 
    // | | | +--------- 4 
    // | | +----------- 5  post-heating on - 0=0ff 1=on - readonly
    // | +------------- 6 
    // +--------------- 7 
    IOPORT_MULTI_PURPOSE_1 : 0x07,
    
    // 1 1 1 1 1 1 1 1  0=0ff 1=on
    // | | | | | | | |
    // | | | | | | | +- 0 
    // | | | | | | +--- 1 damper motor position - 0=winter 1=season - readonly
    // | | | | | +----- 2 fault signal relay - 0=open 1=closed - readonly
    // | | | | +------- 3 supply fan - 0=on 1=off
    // | | | +--------- 4 pre-heating - 0=off 1=on - readonly
    // | | +----------- 5 exhaust-fan - 0=on 1=off
    // | +------------- 6 fireplace-booster - 0=open 1=closed - readonly 
    // +--------------- 7 
    IOPORT_MULTI_PURPOSE_2 : 0x08,

    //01H = speed 1
    //03H = speed 2
    //07H = speed 3
    //0FH = speed 4
    //1FH = speed 5
    //3FH = speed 6
    //7FH = speed 7
    //FFH = speed 8
    FAN_SPEED : 0x29,


    // 33H = 0% FFH = 100%
    HUMIDITY : 0x2A, // higher measured relative humidity from 2F and 30. Translating Formula (x-51)/2.04
    CO2_HIGH : 0x2B,
    CO2_LOW : 0x2C,

    // 1 1 1 1 1 1 1 1 
    // | | | | | | | |
    // | | | | | | | +- 0 
    // | | | | | | +--- 1 Sensor1 - 0=not installed 1=installed - readonly
    // | | | | | +----- 2 Sensor2 - 0=not installed 1=installed - readonly
    // | | | | +------- 3 Sensor3 - 0=not installed 1=installed - readonly
    // | | | +--------- 4 Sensor4 - 0=not installed 1=installed - readonly
    // | | +----------- 5 Sensor5 - 0=not installed 1=installed - readonly
    // | +------------- 6 
    // +--------------- 7 
    INSTALLED_CO2_SENSORS : 0x2D,

    CURRENT_INCOMMING : 0x2E, // Current/Voltage in mA incomming on machine - readonly

    HUMIDITY_SENSOR1 : 0x2F, // sensor value: (x-51)/2.04
    HUMIDITY_SENSOR2 : 0x30, // sensor value: (x-51)/2.04

    TEMP_OUTSIDE : 0x32,
    TEMP_EXHAUST : 0x33,
    TEMP_INSIDE : 0x34,
    TEMP_INCOMMING : 0x35,

    //05H = Supply air temperature sensor fault
    //06H = Carbon dioxide alarm
    //07H = Outdoor air sensor fault
    //08H = Extract air sensor fault
    //09H = Water radiator danger of freezing
    //0AH = Exhaust air sensor fault
    LAST_ERROR_NUMBER : 0x36,

    //Post-heating power-on seconds counter. Percentage of X / 2.5
    POST_HEATING_ON_COUNTER : 0x55,

    //Post-heating off time, in seconds, the counter. Percentage of X / 2.5
    POST_HEATING_OFF_TIME : 0x56,

    //The ventilation zone of air blown to the desired temperature NTC sensor scale
    POST_HEATING_TARGET_VALUE : 0x57,

    // 1 1 1 1 1 1 1 1 
    // | | | | | | | |
    // | | | | | | | +- 0 
    // | | | | | | +--- 1 
    // | | | | | +----- 2 
    // | | | | +------- 3 
    // | | | +--------- 4 
    // | | +----------- 5 
    // | +------------- 6 
    // +--------------- 7 
    FLAGS_1 : 0x6C,

    // 1 1 1 1 1 1 1 1 
    // | | | | | | | |
    // | | | | | | | +- 0 CO2 higher speed-request 0=no 1=Speed​​. up
    // | | | | | | +--- 1 CO2 lower rate request 0=no 1=Speed​​. down
    // | | | | | +----- 2 %RH lower rate request 0=no 1=Speed​​. down
    // | | | | +------- 3 Switch low. Speed.-request 0=no 1=Speed​. down
    // | | | +--------- 4 
    // | | +----------- 5 
    // | +------------- 6 CO2 alarm 0=no 1=CO2 alarm
    // +--------------- 7 sensor Frost alarm 0=no 1=a risk of freezing
    FLAGS_2 : 0x6D,

    // 1 1 1 1 1 1 1 1 
    // | | | | | | | |
    // | | | | | | | +- 0 
    // | | | | | | +--- 1 
    // | | | | | +----- 2 
    // | | | | +------- 3 
    // | | | +--------- 4 
    // | | +----------- 5 
    // | +------------- 6 
    // +--------------- 7 
    FLAGS_3 : 0x6E,

    // 1 1 1 1 1 1 1 1 
    // | | | | | | | |
    // | | | | | | | +- 0 
    // | | | | | | +--- 1 
    // | | | | | +----- 2 
    // | | | | +------- 3 
    // | | | +--------- 4 water radiator danger of freezing 0=no risk 1 = risk
    // | | +----------- 5 
    // | +------------- 6 
    // +--------------- 7 slave/master selection 0=slave 1=master
    FLAGS_4 : 0x6F,

    // 1 1 1 1 1 1 1 1 
    // | | | | | | | |
    // | | | | | | | +- 0 
    // | | | | | | +--- 1 
    // | | | | | +----- 2 
    // | | | | +------- 3 
    // | | | +--------- 4 
    // | | +----------- 5 
    // | +------------- 6 
    // +--------------- 7 preheating status flag 0=on 1=off
    FLAGS_5 : 0x70,

    // 1 1 1 1 1 1 1 1 
    // | | | | | | | |
    // | | | | | | | +- 0 
    // | | | | | | +--- 1 
    // | | | | | +----- 2 
    // | | | | +------- 3 
    // | | | +--------- 4 remote monitoring control 0=no 1=Operation - readonly
    // | | +----------- 5 Activation of the fireplace switch read the variable and set this number one <-- bit can be set to activate fire place switch
    // | +------------- 6 fireplace/booster status 0=off 1=on - read only
    // +--------------- 7
    FLAGS_6 : 0x71,

    //Function time in minutes remaining , descending - readonly
    FIRE_PLACE_BOOSTER_COUNTER : 0x79,

    // Suspend Resume Traffic for CO2 sensor interaction: is sent twice as broadcast
    SUSPEND : 0x91,
    RESUME : 0x8F,

    // 1 1 1 1 1 1 1 1
    // | | | | | | | |
    // | | | | | | | +- 0 Power state
    // | | | | | | +--- 1 CO2 Adjust state
    // | | | | | +----- 2 %RH adjust state
    // | | | | +------- 3 Heating state
    // | | | +--------- 4 Filterguard indicator
    // | | +----------- 5 Heating indicator
    // | +------------- 6 Fault indicator
    // +--------------- 7 service reminder
    SELECT : 0xA3,

    HEATING_SET_POINT : 0xA4,

    //01H = Speed 1
    //03H = Speed 2
    //07H = Speed 3
    //0FH = Speed 4
    //1FH = Speed 5
    //3FH = Speed 6
    //7FH = Speed 7
    //FFH = Speed 8
    FAN_SPEED_MAX : 0xA5,
    
    SERVICE_REMINDER : 0xA6, // months
    
    PRE_HEATING_SET_POINT : 0xA7,
    
    INPUT_FAN_STOP : 0xA8,  // Temp threshold: fan stops if input temp falls below this temp.

    //01H = Speed 1
    //03H = Speed 2
    //07H = Speed 3
    //0FH = Speed 4
    //1FH = Speed 5
    //3FH = Speed 6
    //7FH = Speed 7
    //FFH = Speed 8
    FAN_SPEED_MIN : 0xA9,

    // 1 1 1 1 1 1 1 1
    // | | | | _______
    // | | | |     |  
    // | | | |     +--- 0-3 set adjustment interval of CO2 and %RH in minutes (Regelinterval)
    // | | | |   
    // | | | |   
    // | | | | 
    // | | | +--------- 4 automatic RH basic level seeker state
    // | | +----------- 5 boost switch modde (1=boost, 0 = fireplace)
    // | +------------- 6 radiator type 0 = electric, 1 = water
    // +--------------- 7 cascade adjust 0 = off, 1 = on
    PROGRAM : 0xAA,

    //The maintenance counter informs about the next maintenance alarm time: remaining months, descending.
    MAINTENANCE_MONTH_COUNTER : 0xAB,

    BASIC_HUMIDITY_LEVEL : 0xAE,
    HRC_BYPASS : 0xAF, // Heat recovery cell bypass setpoint temp 
    DC_FAN_INPUT_ADJUSTMENT : 0xB0, // 0-100%
    DC_FAN_OUTPUT_ADJUSTMENT : 0xB1, // 0-100%
    CELL_DEFROSTING_HYSTERESIS : 0xB2, // Defrosting starts when exhaust air drops below this setpoint temp (Hysteresis 4)
    CO2_SET_POINT_UPPER : 0xB3,
    CO2_SET_POINT_LOWER : 0xB4,

    // 1 1 1 1 1 1 1 1
    // | | | | | | | |
    // | | | | | | | +- 0 Function of max speed limit 0 = with adjustment, 1 = always 
    // | | | | | | +--- 1  
    // | | | | | +----- 2
    // | | | | +------- 3
    // | | | +--------- 4
    // | | +----------- 5
    // | +------------- 6
    // +--------------- 7
    PROGRAM2 : 0xB5,

    // This one is queried at startup and answered with 3 but not described in the protocol. Maybe this is a version?
    C0 : 0xC0,
    C1 : 0xC1,
    C2 : 0xC2,
    C3 : 0xC3,
    C4 : 0xC4,
    C5 : 0xC5,
    C6 : 0xC6,
    C7 : 0xC7,
    C8 : 0xC8,
    C9 : 0xC9,
};


function convertMultiPurpose1(value){
    let result = {
	    Bit0 : (value & 0x01) != 0,
		Bit1 : (value & 0x02) != 0,
		Bit2 : (value & 0x04) != 0,
		Bit3 : (value & 0x08) != 0,
		Bit4 : (value & 0x10) != 0,
		PostHeatingOn : (value & 0x20) != 0,
        Bit6 : (value & 0x40) != 0,
		Bit7 : (value & 0x80) != 0,
    };

    return result;
}

function convertMultiPurpose2(value){
    let result = {
	    Bit0 : (value & 0x01) != 0,
		DamperMotorPosition : (value & 0x02) != 0,
		FaultSignalRelayClosed : (value & 0x04) != 0,
		SupplyFanOff : (value & 0x08) != 0,
		PreHeatingOn : (value & 0x10) != 0,
		ExhaustFanOff : (value & 0x20) != 0,
		FireplaceBoosterClosed : (value & 0x40) != 0,
		Bit7 : (value & 0x80) != 0,
    };

    return result;
}

function convertInstalledCO2Sensors(value){
    let result = {
        Bit0 : (value & 0x01) != 0,
	  	Sensor1Installed : (value & 0x02) != 0,
		Sensor2Installed : (value & 0x04) != 0,
		Sensor3Installed : (value & 0x08) != 0,
		Sensor4Installed : (value & 0x10) != 0,
		Sensor5Installed : (value & 0x20) != 0,
        Bit6 : (value & 0x40) != 0,
        Bit7 : (value & 0x80) != 0,
    };

    return result;
}

function convertFlags1(value){
    let result = {
        Bit0 : (value & 0x01) != 0,
		Bit1 : (value & 0x02) != 0,
		Bit2 : (value & 0x04) != 0,
		Bit3 : (value & 0x08) != 0,
		Bit4 : (value & 0x10) != 0,
		Bit5 : (value & 0x20) != 0,
    	Bit6 : (value & 0x40) != 0,
    	Bit7 : (value & 0x80) != 0,
    };

    return result;
}

function convertFlags2(value){
    let result = {
        CO2HigherSpeedRequest : (value & 0x01) != 0,
		CO2LowerSpeedRequest : (value & 0x02) != 0,
		HumiditySpeedRequest : (value & 0x04) != 0,
		SwitchSpeedRequest : (value & 0x08) != 0,
		Bit4 : (value & 0x10) != 0,
		Bit5 : (value & 0x20) != 0,
    	CO2Alarm : (value & 0x40) != 0,
    	FrostAlarm : (value & 0x80) != 0,
    };

    return result;
}

function convertFlags3(value){
    let result = {
        Bit0 : (value & 0x01) != 0,
		Bit1 : (value & 0x02) != 0,
		Bit2 : (value & 0x04) != 0,
		Bit3 : (value & 0x08) != 0,
		Bit4 : (value & 0x10) != 0,
		Bit5 : (value & 0x20) != 0,
    	Bit6 : (value & 0x40) != 0,
    	Bit7 : (value & 0x80) != 0,
    };

    return result;
}

function convertFlags4(value){
    let result = {
        Bit0 : (value & 0x01) != 0,
		Bit1 : (value & 0x02) != 0,
		Bit2 : (value & 0x04) != 0,
		Bit3 : (value & 0x08) != 0,
		FrostAlarmWaterRadiator : (value & 0x10) != 0,
		Bit5 : (value & 0x20) != 0,
    	Bit6 : (value & 0x40) != 0,
    	SlaveMasterSelection : (value & 0x80) != 0,
    };

    return result;
}

function convertFlags5(value){
    let result = {
        Bit0 : (value & 0x01) != 0,
		Bit1 : (value & 0x02) != 0,
		Bit2 : (value & 0x04) != 0,
		Bit3 : (value & 0x08) != 0,
		Bit4 : (value & 0x10) != 0,
		Bit5 : (value & 0x20) != 0,
    	Bit6 : (value & 0x40) != 0,
    	PreHeatingStatus : (value & 0x80) != 0,
    };

    return result;
}

function convertFlags6(value){
    let result = {
        Bit0 : (value & 0x01) != 0,
		Bit1 : (value & 0x02) != 0,
		Bit2 : (value & 0x04) != 0,
		RemoteMonitoringControl : (value & 0x08) != 0,
		FirePlaceSwitchActivator : (value & 0x10) != 0,
		FirePlaceBoosterStatus : (value & 0x20) != 0,
    	Bit6 : (value & 0x40) != 0,
    	Bit7 : (value & 0x80) != 0,
    };

    return result;
}

function convertSelect(value){
    let result = {
        PowerState : (value & 0x01) != 0,
		Co2AdjustState : (value & 0x02) != 0,
		HumidityAdjustState : (value & 0x04) != 0,
		HeatingState : (value & 0x08) != 0,
		FilterGuardIndicator : (value & 0x10) != 0,
		HeatingIndicator : (value & 0x20) != 0,
    	FaultIndicator : (value & 0x40) != 0,
    	ServiceReminderIndicator : (value & 0x80) != 0,
    };

    return result;
}

function convertProgram(value){
    let result = {
        AdjustmentIntervalMinutes : value & 0x0F,

		AutomaticHumidityLevelSeekerState : (value & 0x10) != 0,
		BoostSwitchMode : (value & 0x20) != 0, // 1=boost, 0 = fireplace
    	RadiatorType : (value & 0x40) != 0, // 0 = electric, 1 = water
    	CascadeAdjust : (value & 0x80) != 0, // adjust 0 = off, 1 = on
    };

    return result;
}

function convertProgram2(value){
    let result = {
		MaxSpeedLimitMode : (value & 0x01) != 0, // 0 = with adjustment, 1 = always 
    };

    return result;
}

// 33H = 0% FFH = 100%
function convertHumidity(value)
{
    let humidity = value; // (value-51)/2.04; <-- seems to be wrong.
    return humidity;
}

// percentage X / 2.5
function convertHeating(value)
{
    let result = value / 2.5;
    return result;
}

// 3 is around 1 degree
function convertHysteresis(value)
{
    return Math.round(value / 3);
}

function convertError(value)
{
    let result;
    switch(value)
    {
        case 0:
            result = 'No error';
            break;
        case 5:
            result = 'Supply air temperature sensor fault';
            break;
        case 6:
            result = 'Carbon dioxide alarm';
            break;
        case 7:
            result = 'Outdoor air sensor fault';
            break;
        case 8:
            result = 'Extract air sensor fault';
            break;
        case 9:
            result = 'Water radiator danger of freezing';
            break;
        case 10:
            result = 'Exhaust air sensor fault';
            break;
        default:
            result = '0x' + value.toString(16);
    }

    return result;
}

// see Variables.FanSpeed
const VALLOX_FAN_SPEED_MAPPING =
[
	0x01,
	0x03,
	0x07,
	0x0F,
	0x1F,
	0x3F,
	0x7F,
	0xFF
];

// 8 --> 0xFF
function convertFanSpeedBack(value)
{
    let fanSpeed = VALLOX_FAN_SPEED_MAPPING[value - 1];
    return fanSpeed;
}

// 0xFF --> 8
function convertFanSpeed(value)
{
    let fanSpeed = 0;

    for (let i = 0; i < 8; i++)
    {
        if (VALLOX_FAN_SPEED_MAPPING[i] == value)
        {
            fanSpeed = i + 1;
            break;
        }
    }

    return fanSpeed;
}

function convertFanSpeedRelays(value){
    let result = {
	    FanSpeedRelay1 : (value & 0x01) != 0,
		FanSpeedRelay2 : (value & 0x02) != 0,
		FanSpeedRelay3 : (value & 0x04) != 0,
		FanSpeedRelay4 : (value & 0x08) != 0,
		FanSpeedRelay5 : (value & 0x10) != 0,
		FanSpeedRelay6 : (value & 0x20) != 0,
		FanSpeedRelay7 : (value & 0x40) != 0,
		FanSpeedRelay8 : (value & 0x80) != 0,
    };

    return result;
}

// see Variables.TEMP_...
const VALLOX_TEMPERATURE_MAPPING =
[
	-74, -70, -66, -62, -59, -56, -54, -52,
	-50, -48, -47, -46, -44, -43, -42, -41,
	-40, -39, -38, -37, -36, -35, -34, -33,
	-33, -32, -31, -30, -30, -29, -28, -28,
	-27, -27, -26, -25, -25, -24, -24, -23,
	-23, -22, -22, -21, -21, -20, -20, -19,
	-19, -19, -18, -18, -17, -17, -16, -16,
	-16, -15, -15, -14, -14, -14, -13, -13,
	-12, -12, -12, -11, -11, -11, -10, -10,
	-9,  -9,  -9,  -8,  -8,  -8,  -7,  -7,
	-7,  -6,  -6,  -6,  -5,  -5,  -5,  -4,
	-4,  -4,  -3,  -3,  -3,  -2,  -2,  -2,
	-1,  -1,  -1,  -1,  0,   0,   0,   1,
	1,   1,   2,   2,   2,   3,   3,   3,
	4,   4,   4,   5,   5,   5,   5,   6,
	6,   6,   7,   7,   7,   8,   8,   8,
	9,   9,   9,   10,  10,  10,  11,  11,
	11,  12,  12,  12,  13,  13,  13,  14,
	14,  14,  15,  15,  15,  16,  16,  16,
	17,  17,  18,  18,  18,  19,  19,  19,
	20,  20,  21,  21,  21,  22,  22,  22,
	23,  23,  24,  24,  24,  25,  25,  26,
	26,  27,  27,  27,  28,  28,  29,  29,
	30,  30,  31,  31,  32,  32,  33,  33,
	34,  34,  35,  35,  36,  36,  37,  37,
	38,  38,  39,  40,  40,  41,  41,  42,
	43,  43,  44,  45,  45,  46,  47,  48,
	49,  49,  50,  51,  52,  53,  53,  54,
	55,  56,  57,  59,  60,  61,  62,  63,
	65,  66,  68,  69,  71,  73,  75,  77,
	79,  81,  82,  86,  90,  93,  97,  100,
	100, 100, 100, 100, 100, 100, 100, 100
];

function convertTemperature(value)
{
    return VALLOX_TEMPERATURE_MAPPING[value];
}

const VALLOX_COMMAND_VARIABLE_MAPPING = {};
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.GET] = { name : Constants.VALLOX_GET, readonly: true, command : Variables.GET };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.IOPORT_FANSPEED_RELAYS] = { name : 'IoPortFanSpeedRelays', readonly: true, command : Variables.IOPORT_FANSPEED_RELAYS  };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.IOPORT_MULTI_PURPOSE_1] = { name : 'IoPortMultiPurpose1', readonly: true, command : Variables.IOPORT_MULTI_PURPOSE_1 };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.IOPORT_MULTI_PURPOSE_2] = { name : 'IoPortMultiPurpose2', readonly: true, command : Variables.IOPORT_MULTI_PURPOSE_2 };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.FAN_SPEED] = { name : 'FanSpeed', readonly: false, command : Variables.FAN_SPEED };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.HUMIDITY] = { name : 'Humidity', readonly: true, command : Variables.HUMIDITY };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.CO2_HIGH] = { name : 'CO2High', readonly: true, command : Variables.CO2_HIGH };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.CO2_LOW] = { name : 'CO2Low', readonly: true, command : Variables.CO2_LOW };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.INSTALLED_CO2_SENSORS] = { name : 'InstalledC02Sensors', readonly: true, command : Variables.INSTALLED_CO2_SENSORS };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.CURRENT_INCOMMING] = { name : 'CurrentIncoming', readonly: true, command : Variables.CURRENT_INCOMMING };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.HUMIDITY_SENSOR1] = { name : 'HumiditySensor1', readonly: true, command : Variables.HUMIDITY_SENSOR1 };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.HUMIDITY_SENSOR2] = { name : 'HumiditySensor2', readonly: true, command : Variables.HUMIDITY_SENSOR2 };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.TEMP_OUTSIDE] = { name : 'TemperatureOutside', readonly: true, command : Variables.TEMP_OUTSIDE };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.TEMP_EXHAUST] = { name :'TemperatureExhaust', readonly: true, command : Variables.TEMP_EXHAUST };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.TEMP_INSIDE] = { name : 'TemperatureInside', readonly: true, command : Variables.TEMP_INSIDE };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.TEMP_INCOMMING] = { name : 'TemperatureIncoming', readonly: true, command : Variables.TEMP_INCOMMING };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.LAST_ERROR_NUMBER] = { name : 'LastErrorNumber', readonly: true, command : Variables.LAST_ERROR_NUMBER };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.POST_HEATING_ON_COUNTER] = { name : 'PostHeastingOnCounter', readonly: true, command : Variables.POST_HEATING_ON_COUNTER };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.POST_HEATING_OFF_TIME] = { name : 'PostHeatingOffTime', readonly: true, command : Variables.POST_HEATING_OFF_TIME };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.POST_HEATING_TARGET_VALUE] = { name : 'PostHeatingTargetValue', readonly: true, command : Variables.POST_HEATING_TARGET_VALUE };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.FLAGS_1] = { name : 'Flags1', readonly: true, command : Variables.FLAGS_1 };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.FLAGS_2] = { name : 'Flags2', readonly: true, command : Variables.FLAGS_2 };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.FLAGS_3] = { name : 'Flags3', readonly: true, command : Variables.FLAGS_3 };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.FLAGS_4] = { name : 'Flags4', readonly: true, command : Variables.FLAGS_4 };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.FLAGS_5] = { name : 'Flags5', readonly: true, command : Variables.FLAGS_5 };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.FLAGS_6] = { name : 'Flags6', readonly: true, command : Variables.FLAGS_6 };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.FIRE_PLACE_BOOSTER_COUNTER] = { name : 'FirePlaceBoosterCounter', readonly: true, command : Variables.FIRE_PLACE_BOOSTER_COUNTER };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.SUSPEND] = { name : 'Suspend', readonly: true, command : Variables.SUSPEND };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.RESUME] = { name : 'Resume', readonly: true, command : Variables.RESUME };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.SELECT] = { name : 'Select', readonly: true, command : Variables.SELECT };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.HEATING_SET_POINT] = { name : 'HeatingSetPoint', readonly: true, command : Variables.HEATING_SET_POINT };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.FAN_SPEED_MAX] = { name : 'FanSpeedMax', readonly: true, command : Variables.FAN_SPEED_MAX };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.SERVICE_REMINDER] = { name : 'ServiceReminder', readonly: true, command : Variables.SERVICE_REMINDER };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.PRE_HEATING_SET_POINT] = { name : 'PreHeatingSetPoint', readonly: true, command : Variables.PRE_HEATING_SET_POINT };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.INPUT_FAN_STOP] = { name : 'InputFanStop', readonly: true, command : Variables.INPUT_FAN_STOP };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.FAN_SPEED_MIN] = { name : 'FanSpeedMin', readonly: true, command : Variables.FAN_SPEED_MIN };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.PROGRAM] = { name : 'Program', readonly: true, command : Variables.PROGRAM };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.MAINTENANCE_MONTH_COUNTER] = { name : 'MaintenanceMonthCounter', readonly: true, command : Variables.MAINTENANCE_MONTH_COUNTER };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.BASIC_HUMIDITY_LEVEL] = { name : 'BasicHumidityLevel', readonly: true, command : Variables.BASIC_HUMIDITY_LEVEL };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.HRC_BYPASS] = { name : 'HRCBypass', readonly: true, command : Variables.HRC_BYPASS };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.DC_FAN_INPUT_ADJUSTMENT] = { name : 'DCFanInputAdjustment', readonly: true, command : Variables.DC_FAN_INPUT_ADJUSTMENT };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.DC_FAN_OUTPUT_ADJUSTMENT] = { name : 'DCFanOutputAdjustment', readonly: true, command : Variables.DC_FAN_OUTPUT_ADJUSTMENT };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.CELL_DEFROSTING_HYSTERESIS] = { name : 'CellDefrostingHysteresis', readonly: true, command : Variables.CELL_DEFROSTING_HYSTERESIS };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.CO2_SET_POINT_UPPER] = { name : 'CO2SetPointUpper', readonly: true, command : Variables.CO2_SET_POINT_UPPER };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.CO2_SET_POINT_LOWER] = { name : 'CO2SetPointLower', readonly: true, command : Variables.CO2_SET_POINT_LOWER };
VALLOX_COMMAND_VARIABLE_MAPPING[Variables.PROGRAM2] = { name : 'Program2', readonly: true, command : Variables.PROGRAM2 };

function getVariableName(command){
    let variable
    try {
        variable = VALLOX_COMMAND_VARIABLE_MAPPING[command].name;    
    } catch {
        variable = '0x' + command.toString(16);
    }
    
    return variable;
}

function getVariableMappingEntry(variable){

    let result;
    let keys = Object.keys(VALLOX_COMMAND_VARIABLE_MAPPING);
    for (let key in keys) {
        if (VALLOX_COMMAND_VARIABLE_MAPPING.hasOwnProperty(key)) {

            let entry = VALLOX_COMMAND_VARIABLE_MAPPING[key];
            if(entry.name === variable){
                result = entry;
                break;
            }
        }
    }

    return result;
}

function isReadonly(command) {

    let readonly
    try {
        readonly = VALLOX_COMMAND_VARIABLE_MAPPING[command].readonly;    
    } catch {
        readonly = true;
    }
    
    return readonly;
}

function getCommand(variable) {
    let command;

    let entry = getVariableMappingEntry(variable);
    if (entry !== undefined){
        command = entry.command;
    }

    return command;
}

function convertValue(command, rawValue){
    let value;
    switch(command) {
        case Variables.IOPORT_FANSPEED_RELAYS:
            value = convertFanSpeedRelays(rawValue);
            break;
        case Variables.IOPORT_MULTI_PURPOSE_1:
            value = convertMultiPurpose1(rawValue);
            break;
        case Variables.IOPORT_MULTI_PURPOSE_2:
            value = convertMultiPurpose2(rawValue);
            break;
        case Variables.FAN_SPEED:
        case Variables.FAN_SPEED_MAX:
        case Variables.FAN_SPEED_MIN:
            value = convertFanSpeed(rawValue);
            break;
        case Variables.HUMIDITY:
        case Variables.HUMIDITY_SENSOR1:
        case Variables.HUMIDITY_SENSOR2:
            value = convertHumidity(rawValue);
            break;
        case Variables.CO2_HIGH:
            value = rawValue;
            break;
        case Variables.CO2_LOW:
            value = rawValue;
            break;
        case Variables.INSTALLED_CO2_SENSORS:
            value = convertInstalledCO2Sensors(rawValue);
            break;
        case Variables.CURRENT_INCOMMING:
            value = rawValue; // mA
            break;
        case Variables.TEMP_OUTSIDE:
        case Variables.TEMP_EXHAUST:
        case Variables.TEMP_INSIDE:
        case Variables.TEMP_INCOMMING:
        case Variables.HRC_BYPASS:
        case Variables.HEATING_SET_POINT:
        case Variables.PRE_HEATING_SET_POINT:
        case Variables.INPUT_FAN_STOP:
        case Variables.POST_HEATING_TARGET_VALUE:
            value = convertTemperature(rawValue);
            break;
        case Variables.CELL_DEFROSTING_HYSTERESIS:
            value = convertHysteresis(rawValue);
            break;
        case Variables.LAST_ERROR_NUMBER:
            value = convertError(rawValue);
            break;
        case Variables.POST_HEATING_ON_COUNTER:
        case Variables.POST_HEATING_OFF_TIME:
            value = convertHeating(rawValue);
            break;
        case Variables.FLAGS_1:
            value = convertFlags1(rawValue);
            break;
        case Variables.FLAGS_2:
            value = convertFlags2(rawValue);
            break;
        case Variables.FLAGS_3:
            value = convertFlags3(rawValue);
            break;
        case Variables.FLAGS_4:
            value = convertFlags4(rawValue);
            break;
        case Variables.FLAGS_5:
            value = convertFlags5(rawValue);
            break;
        case Variables.FLAGS_6:
            value = convertFlags6(rawValue);
            break;
        case Variables.FIRE_PLACE_BOOSTER_COUNTER:
            value = rawValue; // minutes remaining
            break;
        case Variables.SUSPEND:
            value = rawValue;
            break;
        case Variables.RESUME:
            value = rawValue;
            break;
        case Variables.SELECT:
            value = convertSelect(rawValue);
            break;
        case Variables.SERVICE_REMINDER:
            value = rawValue; // months
            break;
        case Variables.PROGRAM:
            value = convertProgram(rawValue);
            break;
        case Variables.MAINTENANCE_MONTH_COUNTER:
            value = rawValue;
            break;
        case Variables.BASIC_HUMIDITY_LEVEL:
            value = rawValue;
            break;
        case Variables.DC_FAN_INPUT_ADJUSTMENT:
        case Variables.DC_FAN_OUTPUT_ADJUSTMENT:
            value = rawValue; // %
            break;
        case Variables.CO2_SET_POINT_UPPER:
        case Variables.CO2_SET_POINT_LOWER:
            value = rawValue;
            break;
        case Variables.PROGRAM2:
            value = convertProgram2(rawValue);
            break;
        case Variables.UNKNOWN: 
            value = rawValue;
            break;
        default:
            value = rawValue;
            break;
      }

      return value;
}

function convertValueBack(command, value){

    let convertedValue;
    switch(command) {
        case Variables.FAN_SPEED:
        case Variables.FAN_SPEED_MAX:
        case Variables.FAN_SPEED_MIN:
            convertedValue = convertFanSpeedBack(value);
            break;
        // case Variables.HRC_BYPASS:
        // case Variables.HEATING_SET_POINT:
        // case Variables.PRE_HEATING_SET_POINT:
        // case Variables.INPUT_FAN_STOP:
        // case Variables.POST_HEATING_TARGET_VALUE:
        //     convertedValue = convertTemperatureBack(value);
        //     break;
        // case Variables.CELL_DEFROSTING_HYSTERESIS:
        //     convertedValue = convertHysteresisBack(value);
        //     break;
        // case Variables.POST_HEATING_ON_COUNTER:
        // case Variables.POST_HEATING_OFF_TIME:
        //     value = convertHeating(value);
        //     break;
        // case Variables.FIRE_PLACE_BOOSTER_COUNTER:
        //     convertedValue = value; // minutes remaining
        //     break;
        // case Variables.SERVICE_REMINDER:
        //     convertedValue = value; // months
        //     break;
        // case Variables.MAINTENANCE_MONTH_COUNTER:
        //     convertedValue = value;
        //     break;
        // case Variables.BASIC_HUMIDITY_LEVEL:
        //     convertedValue = value;
        //     break;
        // case Variables.DC_FAN_INPUT_ADJUSTMENT:
        // case Variables.DC_FAN_OUTPUT_ADJUSTMENT:
        //     convertedValue = value; // %
        //     break;
        // case Variables.CO2_SET_POINT_UPPER:
        // case Variables.CO2_SET_POINT_LOWER:
        //     convertedValue = value;
        //     break;
        default:
            convertedValue = value;
            break;
      }

      return convertedValue;
}

function calculateChecksum(buffer)
{
    let checksum = 0;
    for (let i = 0; i < Constants.VALLOX_LENGTH - 1; i++)
    {
        checksum += buffer[i];
    }
    return checksum % 256;
}

// decodes a 6 bytes telegram from a binary buffer.
function decode(buffer, messageHandler, errorHandler) {
    if (buffer !== undefined) {
        if (buffer.length === Constants.VALLOX_LENGTH) {

            let domain = buffer[0];
            let sender = buffer[1];
            let receiver = buffer[2];
            let command = buffer[3];
            let arg = buffer[4];
            let checksum = buffer[5];    

            let computedChecksum = calculateChecksum(buffer);
            if (checksum === computedChecksum) {

                let variable;
                let value;
                let request;
                if(command == Variables.GET){
                    request = Constants.VALLOX_GET;
                    variable = getVariableName(arg);
                }
                else{
                    request = Constants.VALLOX_SET;
                    variable = getVariableName(command);
                    value = convertValue(command, arg);
                }
                
                let message = {
                    domain : domain,
                    sender : sender,
                    receiver : receiver,
                    command : command,
                    arg : arg,
                    checksum : checksum,
                    variable : variable,
                    request : request
                };

                if(value !== undefined){
                    message.value = value;
                }

                messageHandler(message);
            }
            else {
                errorHandler("Checksum check failed.");
            }
        }
        else {
            errorHandler("Wrong number of bytes received: " + buffer.length);
        }
    }
    else {
        errorHandler("Buffer is empty.");
    }
}

// encodes a 6 bytes telegram for a binary buffer.
function encode(message, bufferHandler, errorHandler) {
    if (message !== undefined) {

        let domain = message.domain;
        let sender = message.sender;
        let receiver = message.receiver;
        let command = message.command;
        let arg = message.arg;   

        let buffer = new Array(Constants.VALLOX_LENGTH);
        buffer[0] = domain;
        buffer[1] = sender;
        buffer[2] = receiver;
        buffer[3] = command;
        buffer[4] = arg;
        buffer[5] = calculateChecksum(buffer);
        
        bufferHandler(buffer);
    }
    else {
        errorHandler("Message is empty.");
    }
}

// converts a variable and value to a command and arg.
function convert(variable, value) {

    let command = getCommand(variable);
    let arg = convertValueBack(command, value);    
    let readonly = isReadonly(command);

    let result = {
        command : command,
        arg : arg,
        readonly : readonly
    }

    return result;
}


exports.decode = decode;
exports.encode = encode;
exports.convert = convert;
exports.constants = Object.freeze(Constants); 
exports.variables = Object.freeze(Variables); 
