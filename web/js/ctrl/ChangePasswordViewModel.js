"use strict";

tutao.provide('tutao.tutanota.ctrl.ChangePasswordViewModel');

/**
 * Handles changing the users password. This view model is created dynamically.
 * @constructor
 */
tutao.tutanota.ctrl.ChangePasswordViewModel = function() {
	tutao.util.FunctionUtils.bindPrototypeMethodsToThis(this);

	this.overallState = ko.observable(null);

	this.oldPassword = ko.observable("");
	this.oldPassword.subscribe(this._oldPasswordUpdated, this);
	this.oldPasswordStatus = ko.observable({ type: "neutral", text: "oldPasswordNeutral_msg" }); 
	this.password1 = ko.observable("");
	this.password2 = ko.observable("");

	this.codeNeeded = ko.observable(false);
	this.code = ko.observable("");
	this.code.subscribe(this._codeUpdated, this);
	this.codeStatus = ko.observable({ type: "neutral", text: "emptyString_msg" });
	this.changePasswordStatus = ko.observable({ type: "neutral", text: "emptyString_msg" });
	this.changePasswordButtonTextId = ko.observable(null);

	this.codeNeeded(tutao.locator.userController.isLoggedInUserAdmin());

	var s = new tutao.tutanota.util.StateMachine();
	this.state = s;
	s.addState("EnterPasswords",    {});
	s.addState("SendCode",          {}, this._sendCode);
	s.addState("EnterCode",         {});
	s.addState("ActivatePassword",  {}, this._activateNewPassword);
	s.addState("PasswordActivated", {});
	s.addState("FinishNoSuccess",   {});
	if (this.codeNeeded()) {
		s.addTransition("EnterPasswords", "userConfirm", "SendCode");
		s.addTransition("SendCode", "serverError", "EnterPasswords");
		s.addTransition("SendCode", "codeTooManyAttempts", "FinishNoSuccess");
		s.addTransition("SendCode", "codeSent", "EnterCode");
		s.addTransition("EnterCode", "userConfirm", "ActivatePassword");
		s.addTransition("ActivatePassword", "activationCodeNotOk", "EnterCode");
		s.addTransition("ActivatePassword", "activationTooManyAttempts", "FinishNoSuccess");
		s.addTransition("ActivatePassword", "serverError", "EnterCode");
	} else {
		s.addTransition("EnterPasswords", "userConfirm", "ActivatePassword");
		s.addTransition("ActivatePassword", "serverError", "EnterPasswords");
	}
	s.addTransition("ActivatePassword", "activationOk", "PasswordActivated");
	
	if (this.codeNeeded()) {
		this.changePasswordStatus({ type: "neutral", text: "pwChangeNeutral_msg", params: {'$': tutao.locator.userController.getLoggedInUser().getPhoneNumbers()[0].getNumber() } });
		this.changePasswordButtonTextId("pwChangeButtonSendCode_action");
		this.overallState("checking");
		var self = this;
		tutao.entity.sys.SecondFactorAuthAllowedReturn.load({}, null).then(function(data, exception) {
			if (data.getAllowed()) {
				self.overallState("allowed");
			} else {
				self.overallState("notAllowed");
			}
		}).caught(function (e) {
            self.overallState("serverNotReachable");
            throw e;
        });
	} else {
		this.changePasswordStatus({ type: "neutral", text: "emptyString_msg" });
		this.changePasswordButtonTextId("pwChangeButtonChangePw_action");
		this.overallState("allowed");
	}
};

/**
 * Must be called when the old password was changed (directly after each character).
 */
tutao.tutanota.ctrl.ChangePasswordViewModel.prototype._oldPasswordUpdated = function() {
	this.oldPasswordStatus({ type: "neutral", text: "oldPasswordNeutral_msg" });
};

/**
 * Must be called when the code was changed (directly after each character).
 */
tutao.tutanota.ctrl.ChangePasswordViewModel.prototype._codeUpdated = function() {
	if (this.code().length == 4) {
		this.codeStatus({ type: "valid", text: "codeValid_msg" });
	} else {
		this.codeStatus({ type: "neutral", text: "codeNeutralEnterCode_msg" });
	}
};

/**
 * Provides the password strength in %.
 * @return {Number} The strength of the password.
 */
tutao.tutanota.ctrl.ChangePasswordViewModel.prototype.getPasswordStrength = function() {
	return tutao.tutanota.util.PasswordUtils.getPasswordStrength(this.password1(), [tutao.locator.userController.getMailAddress(), tutao.locator.userController.getUserGroupInfo().getName()]);
};

/**
 * Provides the status of the first entered new password.
 * @return {Object} The status containing type and text id.
 */
tutao.tutanota.ctrl.ChangePasswordViewModel.prototype.getPassword1Status = function() {
	if (this.password1() == "") {
		return { type: "neutral", text: "password1Neutral_msg" };
	} else if (this.password1() == this.oldPassword()) {
		return { type: "invalid", text: "password1InvalidSame_msg" };
	} else if (this.getPasswordStrength() >= 80) {
		return { type: "valid", text: "passwordValid_msg" };
	} else {
		return { type: "invalid", text: "password1InvalidUnsecure_msg" };
	}
};

/**
 * Provides the status of the second entered new password.
 * @return {Object} The status containing type and text id.
 */
tutao.tutanota.ctrl.ChangePasswordViewModel.prototype.getPassword2Status = function() {
	if (this.password2() == "") {
		return { type: "neutral", text: "password2Neutral_msg" };
	} else if (this.password1() == this.password2()) {
		return { type: "valid", text: "passwordValid_msg" };
	} else {
		return { type: "invalid", text: "password2Invalid_msg" };
	}
};

/**
 * Provides the information if the user may press the confirm button.
 * @return {boolean} True if the button can be presse, false otherwise.
 */
tutao.tutanota.ctrl.ChangePasswordViewModel.prototype.confirmPossible = function() {
	if (this.state.getState() == 'EnterPasswords') {
		return (this.oldPasswordStatus().type == "valid" && this.getPassword1Status().type == "valid" && this.getPassword2Status().type == "valid");
	} else if (this.state.getState() == 'EnterCode') {
		return this.codeStatus().type == "valid";
	} else {
		return false;
	}
};

/**
 * Called when the confirm button is clicked by the user. Triggers the next state in the state machine.
 */
tutao.tutanota.ctrl.ChangePasswordViewModel.prototype.confirm = function() {
	if (this.confirmPossible()) {
		this.state.event("userConfirm");
	}
};

/**
 * Checks the entered old password and updates the password status.
 */
tutao.tutanota.ctrl.ChangePasswordViewModel.prototype.checkOldPassword = function() {
	var self = this;
	if (this.oldPassword().trim() == "") {
		this.oldPasswordStatus({ type: "neutral", text: "oldPasswordNeutral_msg" });
	} else {
		this.oldPasswordStatus({ type: "neutral", text: "check_msg" });
		tutao.locator.kdfCrypter.generateKeyFromPassphrase(self.oldPassword(), tutao.locator.userController.getHexSalt()).then(function(hexKey) {
			var v = tutao.util.EncodingConverter.base64ToBase64Url(tutao.locator.shaCrypter.hashHex(hexKey));
			if(v == tutao.locator.userController.getAuthVerifier()) {
				self.oldPasswordStatus({ type: "valid", text: "passwordValid_msg" });
			} else {
				self.oldPasswordStatus({ type: "invalid", text: "oldPasswordInvalid_msg" });
			}
		});
	}
};

/**
 * Sends the verification code.
 */
tutao.tutanota.ctrl.ChangePasswordViewModel.prototype._sendCode = function() {
	this.changePasswordStatus({ type: "neutral", text: "pwChangeNeutralSendingCode_msg" });
	var self = this;
	var params = {};
	var service = new tutao.entity.sys.SecondFactorAuthData()
        .setLanguage(tutao.locator.languageViewModel.getCurrentLanguage())
	    .setService("ChangePasswordService")
	    .setup(params, null).then(function(dummy) {
            self.changePasswordStatus({ type: "neutral", text: "emptyString_msg" });
            self.codeStatus({ type: "neutral", text: "codeNeutralEnterCode_msg" });
            self.changePasswordButtonTextId("pwChangeButtonChangePw_action");
            self.state.event("codeSent");
        }).caught(tutao.TooManyRequestsError, function(exception) {
            self.changePasswordStatus({ type: "invalid", text: "pwChangeInvalidTooManyChangeAttempts_msg" });
            self.state.event("codeTooManyAttempts");
        }).caught(function(e) {
            self.changePasswordStatus({ type: "invalid", text: "emptyString_msg" });
            self.state.event("serverError");
            throw e;
        });
};

/**
 * Activates the new password.
 */
tutao.tutanota.ctrl.ChangePasswordViewModel.prototype._activateNewPassword = function() {
	this.changePasswordStatus({ type: "neutral", text: "emptyString_msg" });
	var self = this;
	var hexSalt = tutao.locator.kdfCrypter.generateRandomSalt();
	tutao.locator.kdfCrypter.generateKeyFromPassphrase(self.password1(), hexSalt).then(function(userPassphraseKeyHex) {
		var userPassphraseKey = tutao.locator.aesCrypter.hexToKey(userPassphraseKeyHex);
		var pwEncUserGroupKey = tutao.locator.aesCrypter.encryptKey(userPassphraseKey, tutao.locator.userController.getUserGroupKey());
		var verifier = tutao.locator.shaCrypter.hashHex(userPassphraseKeyHex);
		
		var service = new tutao.entity.sys.ChangePasswordData();
		service.setSalt(tutao.util.EncodingConverter.hexToBase64(hexSalt));
		service.setVerifier(verifier);
		service.setPwEncUserGroupKey(pwEncUserGroupKey);
		if (self.codeNeeded()) {
			service.setCode(self.code());
		}
		return service.setup({}, null).then(function(dummy) {
            tutao.locator.userController.passwordChanged(userPassphraseKeyHex, hexSalt);
            self.changePasswordStatus({ type: "valid", text: "pwChangeValid_msg" });
            self.state.event("activationOk");
		}).caught(tutao.TooManyRequestsError, function(exception) {
            self.changePasswordStatus({ type: "invalid", text: "pwChangeInvalidTooManyVerifyAttempts_msg" });
            self.state.event("activationTooManyAttempts");
        }).caught(tutao.InvalidDataError, function(e) {
            self.codeStatus({ type: "invalid", text: "codeInvalid_msg" });
            self.state.event("activationCodeNotOk");
        }).caught(function(e) {
            self.state.event("serverError");
            throw e;
        });
	});
};
