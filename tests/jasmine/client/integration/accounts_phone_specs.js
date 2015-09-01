describe('accounts-phone-client',function(){


    describe('acconts-creation',function(){
        beforeAll(function(done){
            console.log('acconts-creation:beforeAll');
            Meteor.call('fixtures/reset',function(){
                done();
            });
        });

        beforeEach(function(done){
            Meteor.call('fixtures/reset',function(){
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
                done();
            })
        });

    });

    describe('accoutn-login',function(){
        console.log('accoutn-login:beforeAll');
        beforeAll(function(done){
            Meteor.call('fixtures/reset',function(){
                Accounts.createUser({
                    username:'本机号码',
                    phone:'18612345678',
                    password:'123456'
                },function(err){
                    if(!err)
                        Meteor.logout(function(){
                            done();
                        });
                })
            });
        });

        beforeEach(function(done){
            console.log('accoutn-login:beforeEach');
            done();
        });
        afterEach(function(done){
            console.log('accoutn-login:afterEach');
            Meteor.logout(function(){
                done();
            });
        });

        it('can login with a phone number and password',function(done){
            Meteor.loginWithPasswordEx({phone:'18612345678'},'123456',function(err){
                expect(err).toBeUndefined();
                done();
            });

        });

        it('can verify sms code and then login', function(done) {
            Accounts.requestPhoneVerification('18612345678',function(err){
                expect(err).toBeUndefined();
                if(err) done.fail();

                Meteor.call('fixtures/getSMSCode','18612345678',function(err,code){
                    expect(err).toBeUndefined();
                    if(err) done.fail();
                    //console.log(code);
                    Accounts.verifyPhone('18612345678',code,function(err){
                        expect(err).toBeUndefined();
                        expect(Meteor.user().phone.number).toEqual('18612345678');
                        expect(Meteor.user().phone.verified).toBe(true);
                        done();
                    })

                });
            });
        });

        it('can login with a phone without password', function(done) {
            Accounts.requestPhoneVerification('15012345678',function(err){
                expect(err).toBeUndefined();
                if(err) done.fail();
                //get code
                Meteor.call('fixtures/getSMSCode','15012345678',function(err,code){
                    expect(err).toBeUndefined();
                    console.log(code);
                    if(err) done.fail();
                    Accounts.verifyPhone('15012345678',code,function(err){
                        expect(err).toBeUndefined();
                        if(!err){
                            expect(Meteor.user()).toBeDefined();
                            expect(Meteor.user().phone).toBeDefined();
                            expect(Meteor.user().phone.number).toEqual('15012345678');
                            expect(Meteor.user().phone.verified).toBe(true);
                        }
                        done();
                    })

                });
            });
        });

        it('can not sent others phone for a logined user', function(done) {
            var phone1 = '15212345678';
            var phone2 = '15312345678';
            Accounts.requestPhoneVerification(phone1,function(err){
                expect(err).toBeUndefined();
                //get code
                Meteor.call('fixtures/getSMSCode',phone1,function(err,code){
                    expect(err).toBeUndefined();
                    //console.log(code);
                    Accounts.verifyPhone(phone1,code,function(err){
                        expect(err).toBeUndefined();
                        expect(Meteor.user().phone.number).toEqual(phone1);
                        expect(Meteor.user().phone.verified).toBe(true);

                        Accounts.requestPhoneVerification(phone2,function(err){
                            expect(err).toBeDefined();//logined with phone1, only send code to phone1
                            done();
                        });
                    })

                });
            });
        });

        it('can login without password with two phone consecutively', function(done) {
            var phone1 = '15412345678';
            var phone2 = '15512345678';
            Accounts.requestPhoneVerification(phone1,function(err){
                expect(err).toBeUndefined();
                //get code
                Meteor.call('fixtures/getSMSCode',phone1,function(err,code){
                    expect(err).toBeUndefined();
                    //console.log(code);
                    Accounts.verifyPhone(phone1,code,function(err){
                        expect(err).toBeUndefined();
                        expect(Meteor.user().phone.number).toEqual(phone1);
                        expect(Meteor.user().phone.verified).toBe(true);
                        //logout
                        Meteor.logout(function(){
                            Accounts.requestPhoneVerification(phone2,function(err){
                                expect(err).toBeUndefined();
                                //get code
                                Meteor.call('fixtures/getSMSCode',phone2,function(err,code){
                                    expect(err).toBeUndefined();
                                    //console.log(code);
                                    Accounts.verifyPhone(phone2,code,function(err){
                                        expect(err).toBeUndefined();
                                        expect(Meteor.user().phone.number).toEqual(phone2);
                                        expect(Meteor.user().phone.verified).toBe(true);
                                        done();
                                    })

                                });
                            });
                        })

                    })

                });
            });
        });

    });

});