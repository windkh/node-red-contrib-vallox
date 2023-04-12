# Vallox nodes for node-red
[![Platform](https://img.shields.io/badge/platform-Node--RED-red)](https://nodered.org)
![License](https://img.shields.io/github/license/windkh/node-red-contrib-grohe-sense.svg)
[![NPM](https://img.shields.io/npm/v/node-red-contrib-vallox?logo=npm)](https://www.npmjs.org/package/node-red-contrib-vallox)
[![Known Vulnerabilities](https://snyk.io/test/npm/node-red-contrib-vallox/badge.svg)](https://snyk.io/test/npm/node-red-contrib-vallox)
[![Downloads](https://img.shields.io/npm/dm/node-red-contrib-vallox.svg)](https://www.npmjs.com/package/node-red-contrib-vallox)
[![Total Downloads](https://img.shields.io/npm/dt/node-red-contrib-vallox.svg)](https://www.npmjs.com/package/node-red-contrib-vallox)
[![Package Quality](http://npm.packagequality.com/shield/node-red-contrib-vallox.png)](http://packagequality.com/#?package=node-red-contrib-vallox)
[![Open Issues](https://img.shields.io/github/issues-raw/windkh/node-red-contrib-vallox.svg)](https://github.com/windkh/node-red-contrib-vallox/issues)
[![Closed Issues](https://img.shields.io/github/issues-closed-raw/windkh/node-red-contrib-vallox.svg)](https://github.com/windkh/node-red-contrib-vallox/issues?q=is%3Aissue+is%3Aclosed)
...

This package contains nodes for controlling vallox devices via the serial RS485 API.
You must connect the RS485 bus and read the data using e.g. an RS485 to serial converter.
Then use a serial node to read the data and feed it to the node. 

# Dependencies
This package depends on the following libraries


# Disclaimer
This package is not developed nor officially supported by the company Vallox.
It is for demonstrating how to communicate to the devices using node-red.


# Thanks for your donation
If you want to support this free project. Any help is welcome. You can donate by clicking one of the following links:

<a target="blank" href="https://blockchain.com/btc/payment_request?address=1PBi7BoZ1mBLQx4ePbwh1MVoK2RaoiDsp5"><img src="https://img.shields.io/badge/Donate-Bitcoin-green.svg"/></a>
<a target="blank" href="https://www.paypal.me/windkh"><img src="https://img.shields.io/badge/Donate-PayPal-blue.svg"/></a>

<a href="https://www.buymeacoffee.com/windka" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>


# Credits


# Changelog
Changes can be followed [here](/CHANGELOG.md)


# Vallox Node
The node is able to parse an incoming 6 byte long message.
See the example flow [**vallox**](examples/vallox.json) in the examples folder.

# License

Author: Karl-Heinz Wind

The MIT License (MIT)
Copyright (c) 2023 by Karl-Heinz Wind

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
