var Future = Npm.require('fibers/future');


 var next_devmode_sms_id = 0;
 var output_stream = process.stdout;


 var devModeSend = function (options) {
     var devmode_sms_id = next_devmode_sms_id++;

     var stream = output_stream;

     // This approach does not prevent other writers to stdout from interleaving.
     stream.write("====== BEGIN SMS #" + devmode_sms_id + " ======\n");
     stream.write("(SMS not sent; to enable sending, set the SMS provider)\n");
     var future = new Future;
     //stream.write("From:" + options.from + "\n");
     stream.write("To:" + options.to + "\n");
     stream.write("Text:" + options.body + "\n");
     stream.write("====== END SMS #" + devmode_sms_id + " ======\n");
     future['return']();
 };

 /**
 * Send an sms.
 *
 * Connects to SMSManager. If no SMSProvider set, prints formatted message to stdout.
 *
 * @param {string} mobile - The receiver SMS number
 * @param {srting} code - The verification code
 * @param {boolean} type - Register verification (true), association mobile verification (false)
 * @param {string} name - Name of shareBJ account that the mobile bind to, only needed when type is false
 * @param {string} nickname - Nickname of shareBJ account that the mobile bind to, only needed when type is false
 */
 sendRegisterSMS = function (mobile,code,type,name, nickname) {
     var sendMessageSync = Meteor.wrapAsync(SMSDeliver.sendMessage,SMSDeliver);
     if(type)
         sendMessageSync("template:register",mobile,{ code:code, minutes:Accounts._options.verificationValidDuration});
     else
         sendMessageSync("template:mobile_confirm",{ code:code, minutes:Accounts._options.verificationValidDuration, name:name, nickname:nickname});
 };



/*
var Future = Npm.require('fibers/future');
var Twilio = Npm.require('twilio');

SMS = {};
SMSTest = {};

var next_devmode_sms_id = 0;
var output_stream = process.stdout;

// Testing hooks
SMSTest.overrideOutputStream = function (stream) {
    next_devmode_sms_id = 0;
    output_stream = stream;
};

SMSTest.restoreOutputStream = function () {
    output_stream = process.stdout;
};

var devModeSend = function (options) {
    var devmode_sms_id = next_devmode_sms_id++;

    var stream = output_stream;

    // This approach does not prevent other writers to stdout from interleaving.
    stream.write("====== BEGIN SMS #" + devmode_sms_id + " ======\n");
    stream.write("(SMS not sent; to enable sending, set the TWILIO_CREDENTIALS " +
        "environment variable.)\n");
    var future = new Future;
    stream.write("From:" + options.from + "\n");
    stream.write("To:" + options.to + "\n");
    stream.write("Text:" + options.body + "\n");
    stream.write("====== END SMS #" + devmode_sms_id + " ======\n");
    future['return']();
};

/!**
 * Mock out sms sending (eg, during a test.) This is private for now.
 *
 * f receives the arguments to SMS.send and should return true to go
 * ahead and send the email (or at least, try subsequent hooks), or
 * false to skip sending.
 *!/
var sendHooks = [];
SMSTest.hookSend = function (f) {
    sendHooks.push(f);
};

var getTwilio =function(){
    return SMS.twilio;
};
/!**
 * Send an sms.
 *
 * Connects to twilio via the CONFIG_VARS environment
 * variable. If unset, prints formatted message to stdout. The "from" option
 * is required, and at least one of "to", "from", and "body" must be provided;
 * all other options are optional.
 *
 * @param options
 * @param options.from {String} - The sending SMS number
 * @param options.to {String} - The receiver SMS number
 * @param options.body {String}  - The content of the SMS
 *!/
SMS.send = function (options) {
    for (var i = 0; i < sendHooks.length; i++)
        if (!sendHooks[i](options))
            return;

    console.log("twilio:",getTwilio());
    if (getTwilio()) {
        var client = Twilio(getTwilio().ACCOUNT_SID, getTwilio().AUTH_TOKEN);
        // Send SMS  API async func
        var sendSMSSync = Meteor.wrapAsync(client.sendMessage, client);
        // call the sync version of our API func with the parameters from the method call
        var result = sendSMSSync(options, function (err, responseData) { //this function is executed when a response is received from Twilio
            if (err) { // "err" is an error received during the request, if any
                throw new Meteor.Error("Error sending SMS ", err.message);
            }
            return responseData;
        });

        return result;
    } else {
        devModeSend(options);
    }
};

SMS.phoneTemplates = {
    from: function(){return getTwilio()?getTwilio().NUMBER:''},
    text: function (user, code) {
        return '【ShareBJ】你的注册验证码是: ' + code;
    }
};

*/
