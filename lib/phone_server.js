/// Default Accounts Config vars

var AccountGlobalConfigs = {
    verificationRetriesWaitTime        : 10 * 60 * 1000,
    verificationWaitTime               : 20 * 1000,
    verificationCodeLength             : 6,
    verificationMaxRetries             : 2,
    verificationValidDuration           : 10 * 60 * 1000,
    forbidClientAccountCreation        : false,
    sendPhoneVerificationCodeOnCreation: true
};

_.defaults(Accounts._options, AccountGlobalConfigs);


/// Phone

//var Phone = Npm.require('phone');

Accounts._onCreateUserExHooks = [];

Accounts.onCreateUserEx = function(hook){
    if(!_.isFunction(hook))
        throw new Meteor.Error('Hook must be a function');

    this._onCreateUserExHooks.push(hook);
};

Accounts.onCreateUser(function(options,user){
    if(options.phone)
    {
        //console.log("Create user with phone:", options.phone);
        user.phone = { number: options.phone,verified:false};
    }

    user.profile = {name:''};
    if(options.profile)
        user.profile = _.extend(user.profile,options.profile);

    //console.log("before hook:",user);
    user = _.reduce(this._onCreateUserExHooks,function(user,hook){
        try{
            return hook(options,user)
        }catch(e){
            throw  e;
        }

    },user);
    //console.log("after hook:",user);

    return user;
});


/// BCRYPT

//var bcrypt = NpmModuleBcrypt;
//var bcryptHash = Meteor.wrapAsync(bcrypt.hash);
//var bcryptCompare = Meteor.wrapAsync(bcrypt.compare);

// User records have a 'services.phone.bcrypt' field on them to hold
// their hashed passwords (unless they have a 'services.phone.srp'
// field, in which case they will be upgraded to bcrypt the next time
// they log in).
//
// When the client sends a password to the server, it can either be a
// string (the plaintext password) or an object with keys 'digest' and
// 'algorithm' (must be "sha-256" for now). The Meteor client always sends
// password objects { digest: *, algorithm: "sha-256" }, but DDP clients
// that don't have access to SHA can just send plaintext passwords as
// strings.
//
// When the server receives a plaintext password as a string, it always
// hashes it with SHA256 before passing it into bcrypt. When the server
// receives a password as an object, it asserts that the algorithm is
// "sha-256" and then passes the digest to bcrypt.

Accounts._bcryptRounds = 10;

// Given a 'password' from the client, extract the string that we should
// bcrypt. 'password' can be one of:
//  - String (the plaintext password)
//  - Object with 'digest' and 'algorithm' keys. 'algorithm' must be "sha-256".
//
var getPasswordString = function (password) {
    if (typeof password === "string") {
        password = SHA256(password);
    } else { // 'password' is an object
        if (password.algorithm !== "sha-256") {
            throw new Error("Invalid password hash algorithm. " +
                "Only 'sha-256' is allowed.");
        }
        password = password.digest;
    }
    return password;
};

// Use bcrypt to hash the password for storage in the database.
// `password` can be a string (in which case it will be run through
// SHA256 before bcrypt) or an object with properties `digest` and
// `algorithm` (in which case we bcrypt `password.digest`).
//
//var hashPassword = function (password) {
//    password = getPasswordString(password);
//    return bcryptHash(password, Accounts._bcryptRounds);
//};

// Check whether the provided password matches the bcrypt'ed password in
// the database user record. `password` can be a string (in which case
// it will be run through SHA256 before bcrypt) or an object with
// properties `digest` and `algorithm` (in which case we bcrypt
// `password.digest`).
//
//Accounts._checkPhonePassword = function (user, password) {
//    var result = {
//        userId: user._id
//    };
//
//    password = getPasswordString(password);
//
//    if (!bcryptCompare(password, user.services.phone.bcrypt)) {
//        result.error = new Meteor.Error(403, "Incorrect password");
//    }
//
//    return result;
//};
//var checkPassword = Accounts._checkPhonePassword;
var checkPassword = Accounts._checkPassword;

///
/// LOGIN
///

// Users can specify various keys to identify themselves with.
// @param user {Object} with `id` or `phone`.
// @returns A selector to pass to mongo to get the user record.

var selectorFromUserQuery = function (user) {
    if (user.id)
        return {_id: user.id};
    else if (user.phone)
        return {'phone.number': user.phone};
    throw new Error("shouldn't happen (validation missed something)");
};

var findUserFromUserQuery = function (user) {
    var selector = selectorFromUserQuery(user);

    //console.log("selector",selector);
    var user = Meteor.users.findOne(selector);
    if (!user)
        throw new Meteor.Error(403, "User not found");

    return user;
};

// XXX maybe this belongs in the check package
var NonEmptyString = Match.Where(function (x) {
    check(x, String);
    return x.length > 0;
});

var userQueryValidator = Match.Where(function (user) {
    check(user, {
        id   : Match.Optional(NonEmptyString),
        phone: Match.Optional(NonEmptyString)
    });
    if (_.keys(user).length !== 1)
        throw new Match.Error("User property must have exactly one field");
    return true;
});

var passwordValidator = Match.OneOf(
    String,
    { digest: String, algorithm: String }
);

// Handler to login with a phone.
//
// The Meteor client sets options.password to an object with keys
// 'digest' (set to SHA256(password)) and 'algorithm' ("sha-256").
//
// For other DDP clients which don't have access to SHA, the handler
// also accepts the plaintext password in options.password as a string.
//
// (It might be nice if servers could turn the plaintext password
// option off. Or maybe it should be opt-in, not opt-out?
// Accounts.config option?)
//
// Note that neither password option is secure without SSL.
//
Accounts.registerLoginHandler("phone", function (options) {
    //console.log("LoginHandler-phone:",options);

    if (!options.passwordEx || options.srp)
        return undefined; // don't handle

    check(options, {
        user    : userQueryValidator,
        passwordEx: passwordValidator
    });


    var user = findUserFromUserQuery(options.user);
    if (!user)
        throw new Meteor.Error(403, "User not found");

    //console.log("LoginHandler-phone:",user);

    if (!user.services || !user.services.password ||
        !(user.services.password.bcrypt || user.services.password.srp))
        throw new Meteor.Error(403, "User has no password set");

    if (!user.services.password.bcrypt) {
        if (typeof options.password === "string") {
            // The client has presented a plaintext password, and the user is
            // not upgraded to bcrypt yet. We don't attempt to tell the client
            // to upgrade to bcrypt, because it might be a standalone DDP
            // client doesn't know how to do such a thing.
            var verifier = user.services.password.srp;
            var newVerifier = SRP.generateVerifier(options.passwordEx, {
                identity: verifier.identity, salt: verifier.salt});

            if (verifier.verifier !== newVerifier.verifier) {
                return {
                    userId: user._id,
                    error: new Meteor.Error(403, "Incorrect password")
                };
            }

            return {userId: user._id};
        } else {
            // Tell the client to use the SRP upgrade process.
            throw new Meteor.Error(400, "old password format", EJSON.stringify({
                format: 'srp',
                identity: user.services.password.srp.identity
            }));
        }
    }

    //console.log("LoginHandler-phone:checking password");
    return checkPassword(
        user,
        options.passwordEx
    );
});

//// Handler to login using the SRP upgrade path. To use this login
//// handler, the client must provide:
////   - srp: H(identity + ":" + password)
////   - password: a string or an object with properties 'digest' and 'algorithm'
////
//// We use `options.srp` to verify that the client knows the correct
//// password without doing a full SRP flow. Once we've checked that, we
//// upgrade the user to bcrypt and remove the SRP information from the
//// user document.
////
//// The client ends up using this login handler after trying the normal
//// login handler (above), which throws an error telling the client to
//// try the SRP upgrade path.
////
//// XXX COMPAT WITH 0.8.1.3
//Accounts.registerLoginHandler("phone", function (options) {
//    if (!options.srp || !options.passwordEx)
//        return undefined; // don't handle
//
//    check(options, {
//        user    : userQueryValidator,
//        srp     : String,
//        password: passwordValidator
//    });
//
//    var user = findUserFromUserQuery(options.user);
//
//    // Check to see if another simultaneous login has already upgraded
//    // the user record to bcrypt.
//    if (user.services && user.services.phone &&
//        user.services.phone.bcrypt)
//        return checkPassword(user, options.password);
//
//    if (!(user.services && user.services.phone
//        && user.services.phone.srp))
//        throw new Meteor.Error(403, "User has no password set");
//
//    var v1 = user.services.phone.srp.verifier;
//    var v2 = SRP.generateVerifier(
//        null,
//        {
//            hashedIdentityAndPassword: options.srp,
//            salt                     : user.services.phone.srp.salt
//        }
//    ).verifier;
//    if (v1 !== v2)
//        return {
//            userId: user._id,
//            error : new Meteor.Error(403, "Incorrect password")
//        };
//
//    // Upgrade to bcrypt on successful login.
//    var salted = hashPassword(options.password);
//    Meteor.users.update(
//        user._id,
//        {
//            $unset: { 'services.phone.srp': 1 },
//            $set  : { 'services.phone.bcrypt': salted }
//        }
//    );
//
//    return {userId: user._id};
//});

// Force change the users phone password.

/**
 * @summary Forcibly change the password for a user.
 * @locus Server
 * @param {String} userId The id of the user to update.
 * @param {String} newPassword A new password for the user.
 */
//Accounts.setPhonePassword = function (userId, newPlaintextPassword) {
//    var user = Meteor.users.findOne(userId);
//    if (!user)
//        throw new Meteor.Error(403, "User not found");
//
//    Meteor.users.update(
//        {_id: user._id},
//        {
//            $unset: {
//                'services.phone.srp'         : 1, // XXX COMPAT WITH 0.8.1.3
//                'services.phone.verify'      : 1,
//                'services.resume.loginTokens': 1
//            },
//            $set  : {'services.phone.bcrypt': hashPassword(newPlaintextPassword)} }
//    );
//};

///
/// Send phone VERIFICATION code
///

// send the user a sms with a code that can be used to verify number

/**
 * @summary Send an SMS with a code the user can use verify their phone number with.
 * @locus Server
 * @param {String} userId The id of the user to send SMS to.
 * @param {String} phone  Which phone of the user's to send the SMS to. Must be in user's phone
 * @param {Object} options {purpose: Boolean, initial:String} purpose:'register' or 'bind', initial: initial password
 */
Accounts.sendPhoneVerificationCode = function (userId, phone, options) {
    check(options,{
        purpose: Match.Where(function(x){return x==='register' || x==='bind'}),
        initial: Match.Optional(String)
    });

    var selector = {_id:userId};
    if(phone)
        selector['phone.number'] = phone;

    //console.log(selector);
    var user = Meteor.users.findOne(selector);
    if (!user)
        throw new Error("Can't find user with phone:" + phone);

    // Make sure the user exists, and phone is one of their phones.
    // pick the first unverified phone if we weren't passed an phone.
    if (!phone && user.phone) {
        phone = user.phone && user.phone.number;
    }
    // make sure we have a valid phone
    if (!phone)
        throw new Error("No such phone for user.");

    // If sent more than max retry wait
    var waitTimeBetweenRetries = Accounts._options.verificationWaitTime;
    var maxRetryCounts = Accounts._options.verificationMaxRetries;

    var verifyObject = {numOfRetries: 0};
    if (user.services && user.services.phone && user.services.phone.verification) {
        verifyObject = user.services.phone.verification;
    }

    var curTime = new Date();
    // Check if last retry was too soon
    var nextRetryDate = verifyObject && verifyObject.lastRetry
        && new Date(verifyObject.lastRetry.getTime() + waitTimeBetweenRetries);
    if (nextRetryDate && nextRetryDate > curTime) {
        var waitTimeInSec = Math.ceil(Math.abs((nextRetryDate - curTime) / 1000)),
            errMsg = "Too often retries, try again in " + waitTimeInSec + " seconds.";
        throw new Error(errMsg);
    }
    // Check if there where too many retries
    if (verifyObject.numOfRetries > maxRetryCounts) {
        // Check if passed enough time since last retry
        var waitTimeBetweenMaxRetries = Accounts._options.verificationRetriesWaitTime;
        nextRetryDate = new Date(verifyObject.lastRetry.getTime() + waitTimeBetweenMaxRetries);
        if (nextRetryDate > curTime) {
            var waitTimeInMin = Math.ceil(Math.abs((nextRetryDate - curTime) / 60000)),
                errMsg = "Too many retries, try again " + waitTimeInMin + " minutes later.";
            throw new Error(errMsg);
        }
    }
    verifyObject.code = getRandomCode(Accounts._options.verificationCodeLength);
    verifyObject.when = new Date();
    verifyObject.phone = phone;
    if(options.initial)
        verifyObject.initial = options.initial;
    verifyObject.lastRetry = curTime;
    verifyObject.numOfRetries++;

    const nUpdated = Meteor.users.update(
        {_id: userId},
        {$set: {'services.phone.verification': verifyObject}});

    if(nUpdated!==1){
        throw new Error("Fail to update verification code to datbase");
    }
    // before passing to template, update user object with new token
    Meteor._ensure(user, 'services', 'phone');
    user.services.phone.verification = verifyObject;

    var sendMessageSync = Meteor.wrapAsync(SMSDeliver.sendMessage,SMSDeliver);
    if(options.purpose==='register')
        sendMessageSync("template:register",user.phone.number,{
            code:verifyObject.code, minutes:Accounts._options.verificationValidDuration/1000/60});
    else if(options.purpose==='bind')
        sendMessageSync("template:mobile_confirm",user.phone.number,{
            code:verifyObject.code, minutes:Accounts._options.verificationValidDuration/1000/60,
            name:user.username, nickname:user.profile?user.profile.name:''});

};

// Send SMS with code to user.
Meteor.methods({
    requestPhoneVerification: function (phone, profile) {
        //console.log('requestPhoneVerification called on server');
        check(phone, String);
        check(profile, Object);
        // Change phone format to international SMS format
        //phone = normalizePhone(phone);

        if (!phone) {
            throw new Meteor.Error(403, "Not a valid phone");
        }

        var userId = this.userId;
        var existingUser = Meteor.users.findOne({'phone.number': phone}, {fields: {'_id': 1,phone:1}});
        if(existingUser ){
            //if(existingUser.phone.verified)
                throw new Meteor.Error(400,"phone already used by others");
            //else
            //    throw new Meteor.Error(400,"phone used but not confirmed");
        }
        try{
            if (!userId) {//currently not login
                // Create new user with phone number
                //var profile = options && options.profile
                const initialPassword = Random.hexString(8);
                userId = Accounts.createUser({
                    username:"号码"+phone,
                    phone:phone,
                    password: initialPassword,
                    profile: profile || {}
                });
                //console.log(`created user:${userId},${initialPassword}`);
                Accounts.sendPhoneVerificationCode(userId, phone,{purpose:'register',initial:initialPassword});
            }else{
                Accounts.sendPhoneVerificationCode(userId, phone,{purpose:'bind'});
            }
        }catch(e){
            throw new Meteor.Error(500,e.message);
        }
    }
});

// Take code from sendVerificationPhone SMS, mark the phone as verified,
// and log them in.
Meteor.methods({
    verifyPhone: function (phone, code) {
        var self = this;

        return Accounts._loginMethod(
            self,
            "verifyPhone",
            arguments,
            "phone",
            function () {
                check(code, String);
                check(phone, String);

                if (!code) {
                    throw new Meteor.Error(403, "Code is must be provided to method");
                }
                // Change phone format to international SMS format
                //phone = normalizePhone(phone);

                //console.log(phone,code);
                var user = Meteor.users.findOne(
                    {
                        'services.phone.verification.code': code,
                        'phone.number': phone
                    });
                //console.log("got user",user);
                if (!user && !isMasterCode(code))
                    throw new Meteor.Error(403, "Verification code expired");


                //var tokenRecord = _.find(user.services.phone.verification,
                //    function (t) {
                //        return t.code == code;
                //    });
                //if (!tokenRecord && !isMasterCode(code))
                //    return {
                //        userId: user._id,
                //        error: new Meteor.Error(403, "Verification code expired")
                //    };


                if (!user && isMasterCode(code)) {
                    user = Meteor.users.findOne({'phone.number': phone});
                    if (!user) {
                        throw new Meteor.Error(403, "Invalid phone number");
                    }
                    //tokenRecord.number = phone;
                }

                if(!user) //by master code
                {
                    user = Meteor.users.findOne({'phone.number': phone,'phone.verified':false});
                    if(!user){
                        throw new Meteor.Error(403, "Verification code expired");
                    }
                }

                const initialPassoword = user.services.phone.verification.initial;

                Meteor.users.update(
                    {_id: user._id},
                    {
                        $set: {'phone.verified': true},
                        $unset: {'services.phone.verification': 1}
                    });

                //console.log(`initialPassoword:${initialPassoword}`);
                if(initialPassoword){
                    const sendSMSSync = Meteor.wrapAsync(SMSDeliver.sendMessage,SMSDeliver);
                    sendSMSSync("template:initial_password",user.phone.number,{password:initialPassoword});
                }
                return {userId: user._id};
            });
        }
});

///
/// CREATING USERS
///

// Shared createUser function called from the createUser method, both
// if originates in client or server code. Calls user provided hooks,
// does the actual user insertion.
//
// returns the user id
//var createUser = function (options) {
//    // Unknown keys allowed, because a onCreateUserHook can take arbitrary
//    // options.
//    check(options, Match.ObjectIncluding({
//        phone   : Match.Optional(String),
//        password: Match.Optional(passwordValidator)
//    }));
//
//    var phone = options.phone;
//    if (!phone)
//        throw new Meteor.Error(400, "Need to set phone");
//
//    var existingUser = Meteor.users.findOne(
//        {'phone.number': phone});
//
//    if (existingUser) {
//        throw new Meteor.Error(403, "User with this phone number already exists");
//    }
//
//    var user = {services: {}};
//    if (options.password) {
//        var hashed = hashPassword(options.password);
//        user.services.phone = { bcrypt: hashed };
//    }
//
//    user.phone = {number: phone, verified: false};
//
//    try {
//        return Accounts.insertUserDoc(options, user);
//    } catch (e) {
//
//        // XXX string parsing sucks, maybe
//        // https://jira.mongodb.org/browse/SERVER-3069 will get fixed one day
//        if (e.name !== 'MongoError') throw e;
//        var match = e.err.match(/E11000 duplicate key error index: ([^ ]+)/);
//        if (!match) throw e;
//        if (match[1].indexOf('users.$phone.number') !== -1)
//            throw new Meteor.Error(403, "Phone number already exists, failed on creation.");
//        throw e;
//    }
//};

// method for create user. Requests come from the client.
//Meteor.methods({createUserWithPhone: function (options) {
//    var self = this;
//
//    check(options, Object);
//    if (options.phone) {
//        check(options.phone, String);
//        // Change phone format to international SMS format
//        options.phone = normalizePhone(options.phone);
//    }
//
//    return Accounts._loginMethod(
//        self,
//        "createUserWithPhone",
//        arguments,
//        "phone",
//        function () {
//            if (Accounts._options.forbidClientAccountCreation)
//                return {
//                    error: new Meteor.Error(403, "Signups forbidden")
//                };
//
//            // Create user. result contains id and token.
//            var userId = createUser(options);
//            // safety belt. createUser is supposed to throw on error. send 500 error
//            // instead of sending a verification email with empty userid.
//            if (!userId)
//                throw new Error("createUser failed to insert new user");
//
//            // If `Accounts._options.sendPhoneVerificationCodeOnCreation` is set, register
//            // a token to verify the user's primary phone, and send it to
//            // by sms.
//            if (options.phone && Accounts._options.sendPhoneVerificationCodeOnCreation) {
//                Accounts.sendPhoneVerificationCode(userId, options.phone);
//            }
//
//            // client gets logged in as the new user afterwards.
//            return {userId: userId};
//        }
//    );
//}});

// Create user directly on the server.
//
// Unlike the client version, this does not log you in as this user
// after creation.
//
// returns userId or throws an error if it can't create
//
// XXX add another argument ("server options") that gets sent to onCreateUser,
// which is always empty when called from the createUser method? eg, "admin:
// true", which we want to prevent the client from setting, but which a custom
// method calling Accounts.createUser could set?
//
//Accounts.createUserWithPhone = function (options, callback) {
//    options = _.clone(options);
//
//    // XXX allow an optional callback?
//    if (callback) {
//        throw new Error("Accounts.createUser with callback not supported on the server yet.");
//    }
//
//    return createUser(options);
//};

///
/// PASSWORD-SPECIFIC INDEXES ON USERS
///
Meteor.users._ensureIndex('phone.number',
    {unique: 1, sparse: 1});
Meteor.users._ensureIndex('services.phone.verify.code',
    {unique: 1, sparse: 1});

/*** Control published data *********/
Meteor.startup(function () {
    /** Publish phones to the client **/
    Meteor.publish(null, function () {
        if (this.userId) {
            return Meteor.users.find({_id: this.userId},
                {fields: {'phone': 1}});
        } else {
            this.ready();
        }
    });

    /** Disable user profile editing **/
    Meteor.users.deny({
        update: function () {
            return true;
        }
    });
});

/************* Phone verification hook *************/

// Callback exceptions are printed with Meteor._debug and ignored.
var onPhoneVerificationHook = new Hook({
    debugPrintExceptions: "onPhoneVerification callback"
});

/**
 * @summary Register a callback to be called after a phone verification attempt succeeds.
 * @locus Server
 * @param {Function} func The callback to be called when phone verification is successful.
 */
//Accounts.onPhoneVerification = function (func) {
//    return onPhoneVerificationHook.register(func);
//};
//
//var successfulVerification = function (userId) {
//    onPhoneVerificationHook.each(function (callback) {
//        callback(userId);
//        return true;
//    });
//};

// Give each login hook callback a fresh cloned copy of the attempt
// object, but don't clone the connection.
//
var cloneAttemptWithConnection = function (connection, attempt) {
    var clonedAttempt = EJSON.clone(attempt);
    clonedAttempt.connection = connection;
    return clonedAttempt;
};
/************* Helper functions ********************/

// Return normalized phone format
//var normalizePhone = function (phone) {
//    // If phone equals to one of admin phone numbers return it as-is
//    if (phone && Accounts._options.adminPhoneNumbers && Accounts._options.adminPhoneNumbers.indexOf(phone) != -1) {
//        return phone;
//    }
//    return Phone(phone)[0];
//};

/**
 * Check whether the given code is the defined master code
 * @param code
 * @returns {*|boolean}
 */
var isMasterCode = function (code) {
    return code && Accounts._options.phoneVerificationMasterCode &&
        code == Accounts._options.phoneVerificationMasterCode;
}

/**
 * Get random phone verification code
 * @param length
 * @returns {string}
 */
var getRandomCode = function (length) {
    length = length || 4;
    var output = "";
    while (length-- > 0) {

        output += getRandomDigit();
    }
    return output;
}

/**
 * Return random 1-9 digit
 * @returns {number}
 */
var getRandomDigit = function () {
    return Math.floor((Math.random() * 9) + 1);
}