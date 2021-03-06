describe('accounts-phone-client',function(){
    var getSMS, requestSMS, verify;
    requestSMS = function (phone) {
        return new Promise(function (resolve, reject) {
            Accounts.requestPhoneVerification(phone, function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    };

    getSMS = function (phone) {
        return new Promise(function (resolve, reject) {
            Meteor.call('fixtures/getSMSCode', phone, function (err, code) {
                //debugger;
                if (err) {
                    reject(err);
                } else {
                    resolve(code);
                }
            });
        })
    };

    verify = function (phone, code) {
        return new Promise(function (resolve, reject) {
            Accounts.verifyPhone(phone, code, function (err) {
                if (err) reject(err);
                else resolve();
            })
        })
    };

    describe('accounts-creation',function(){
        beforeEach(function(done){
            Meteor.call('fixtures/users/reset',function(){
                done();
            });
        });

        it('can create a user with a phone number',function(done){
            Accounts.createUser({
                username:'本机号码',
                phone:'18912345678',
                password:'123456'
            },function(err,userId){
                //console.log("error object",err);
                expect(err).toBeUndefined();
                expect(Meteor.user().phone).toEqual({number:'18912345678',verified:false});
                expect(Meteor.user().username).toEqual('本机号码');
                expect(Meteor.user().profile).toBeDefined();
                done();
            })
        });

        it('can create a user with a phone number by verification', function (done) {
            Accounts.requestPhoneVerification('18012345678', {name: 'tester nick name'}, function (err) {
                if (err)
                {
                    expect(err).toBeUndefined();
                    done();
                }
                getSMS('18012345678')
                    .then(function (code) {
                        return verify('18012345678', code)
                    }, (err)=>{
                        expect(err).toBeUndefined();
                        done();
                    })
                    .then(function () {
                        expect(Meteor.user().phone).toEqual({number: '18012345678', verified: true});
                        expect(Meteor.user().username).toEqual('号码18012345678');
                        expect(Meteor.user().profile).toBeDefined();
                        expect(Meteor.user().profile.name).toEqual('tester nick name');
                        done();
                    }).catch((err)=>{
                        expect(err).toBeDefined();
                        done();
                    })
            });
        });

    });

    describe('account-login',function() {
        //console.log('accoutn-login:beforeAll');
        beforeEach(function (done) {
            Meteor.call('fixtures/users/reset', function () {
                Accounts.createUser({
                    username: '本机号码',
                    phone: '18612345678',
                    password: '123456'
                }, function (err) {
                    if (!err)
                        Meteor.logout(function () {
                            done();
                        });
                })
            });
        });

        afterEach(function (done) {
            //console.log('accoutn-login:afterEach');
            Meteor.logout(function () {
                done();
            });
        });

        it('can login with a phone number and password', function (done) {
            Meteor.loginWithPasswordEx({phone: '18612345678'}, '123456', function (err) {
                expect(err).toBeUndefined();
                done();
            });

        });


        it('can verify sms code and then login', function (done) {
            requestSMS('18612345678')
                .then(function () {
                    return getSMS('18612345678')
                }, (err)=>{
                    expect(err).toBeDefined();
                    done();
                })
                .then(function (code) {
                    return verify('18612345678', code);
                }, (err)=>{
                    expect(err).toBeDefined();
                    done();
                })
                .then(function () {
                    expect(Meteor.user().phone.number).toEqual('18612345678');
                    expect(Meteor.user().phone.verified).toBe(true);
                    done();
                }, (err)=>{
                    expect(err).toBeDefined();
                    done();
                });
        });


        it('can login with a phone without password', function (done) {
            requestSMS('15012345678')
                .then(function () {
                    return getSMS('15012345678')
                }, (err)=>{
                    expect(err).toBeDefined();
                    done();
                })
                .then(function (code) {
                    return verify('15012345678', code)
                }, (err)=>{
                    expect(err).toBeUndefined();
                    done();
                })
                .then(function () {
                    expect(Meteor.user()).toBeDefined();
                    expect(Meteor.user().phone).toBeDefined();
                    expect(Meteor.user().phone.number).toEqual('15012345678');
                    expect(Meteor.user().phone.verified).toBe(true);
                    done();
                }, (err)=>{
                    expect(err).toBeDefined();
                    done();
                });
        });

        it('can not sent others phone for a logined user', function (done) {
            var phone1 = '15212345678';
            var phone2 = '15312345678';
            requestSMS(phone1)
                .then(function () {
                    return getSMS(phone1)
                }, (err)=>{
                    expect(err).toBeDefined();
                    done();
                })
                .then(function (code) {
                    return verify(phone1, code)
                }, (err)=>{
                    expect(err).toBeDefined();
                    done();
                })
                .then(function () {
                    expect(Meteor.user().phone.number).toEqual(phone1);
                    expect(Meteor.user().phone.verified).toBe(true);
                }, (err)=>{
                    expect(err).toBeDefined();
                    done();
                })
                .then(function () {
                    return requestSMS(phone2)
                })
                .catch((err)=>{
                    expect(err).toBeDefined();
                    done();
                })
        });

        it('can login without password with two phone consecutively', function (done) {
            var phone1 = '15412345678';
            var phone2 = '15512345678';
            requestSMS(phone1)
                .then(function () {
                    return getSMS(phone1)
                }, done.fail)
                .then(function (code) {
                    return verify(phone1, code)
                }, done.fail)
                .then(function () {
                    expect(Meteor.user().phone.number).toEqual(phone1);
                    expect(Meteor.user().phone.verified).toBe(true);
                    //logout
                    return new Promise(function (resolve, reject) {
                        Meteor.logout(function () {
                            resolve()
                        })
                    })
                },done.fail)
                .then(function () {
                    return requestSMS(phone2)
                }, done.fail)
                .then(function () {
                    return getSMS(phone2)
                }, done.fail)
                .then(function (code) {
                    return verify(phone2, code)
                }, done.fail)
                .then(function () {
                    expect(Meteor.user().phone.number).toEqual(phone2);
                    expect(Meteor.user().phone.verified).toBe(true);
                    done();
                }
                , done.fail);

        });
    });
});