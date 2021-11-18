const Joi = require('joi');
const Token = require('../models/Token');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const sendMail = require('../utils/sendMail');

exports.register = async (req, res, next) => {
    console.log('register');
    try{
        const schema = Joi.object({ username: Joi.string().required(), email: Joi.string().email().required(), password: Joi.string().min(6).required() });
        const { error } = schema.validate(req.body);
        if (error) return next(new ErrorResponse(error.details[0].message, 400));

        const user = await User.create(req.body);

        sendToken(user, 201, res);
    }catch (error){
        next(error);
    }
}

exports.login = async (req, res, next) => {
    console.log("login");
    try{
        const schema = Joi.object({ email: Joi.string().email().required(), password: Joi.string().required() });
        const { error } = schema.validate(req.body);
        if (error) return next(new ErrorResponse(error.details[0].message, 400));

        const {email, password} = req.body;
        //select("+password") means that we want also to return the password, because is schema we set select to false
        const user = await User.findOne({ email }).select("+password");
        if(!user){
            return next(new ErrorResponse("Invalid credentials.", 401));
        }
        //check if user password matches with the password from req.body
        const isMatched = await user.matchPasswords(password);
        if(!isMatched){
            return next(new ErrorResponse("Invalid credentials.", 401));
        }

        sendToken(user, 200, res);

    }catch(error){
        next(error);
    }
}

exports.logout = (req, res) => {
    res.clearCookie("userId")
    res.status(200).json({message: "Successfully logged out!"});
}

exports.forgotPassword = async (req, res, next) => {
    try {
        const schema = Joi.object({ email: Joi.string().email().required() });
        const { error } = schema.validate(req.body);
        if (error) return next(new ErrorResponse(error.details[0].message, 400));

        const user = await User.findOne({ email: req.body.email });
        if (!user)
            return next(new ErrorResponse("User with given email doesn't exist.", 404));

        const token = await Token.findOne({ userId: user._id });
        if (!token) {
            const resetToken = token.getResetPasswordToken();
            token = await new Token({
                userId: user._id,
                token: token.hashResetPasswordToken(resetToken),
            }).save();
        }

        const link = `${process.env.BASE_URL}/password-reset/${user._id}/${resetToken}`;;
        sendResetMail(email, link, res);

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  };

exports.resetPassword = async (req, res, next) => {
    try{
        const schema = Joi.object({ password: Joi.string().min(6).required() });
        const { error } = schema.validate(req.body);
        if (error) return next(new ErrorResponse(error.details[0].message, 400));

        const user = await User.findById(req.params.userId);
        if (!user) return next(new ErrorResponse("Invalid link or already expired.", 400));
        
        const token = await Token.findOne({
            userId: user._id,
            token: token.token.hashResetPasswordToken(req.params.token),
        });
        if (!token) return next(new ErrorResponse("Invalid link or already expired.", 400));

        user.password = req.body.password;
        await user.save();
        await token.delete();

        res.status(200).json({message: "Password was changed successfully." });
    } catch (error) {
      next(error);
    }
  };

const sendToken = (user, statusCode, res) => {
    const userId = user.getId();
    const token = user.getSignedToken();
    let days = 5 * 24 * 3600000;
    res.cookie("userId", userId, {path: '/', expires: new Date(Date.now() + days), httpOnly: true } );
    res.status(statusCode).json({token});
}

const sendResetMail = async (email, link, res) => {
    //clicktracking off to avoid weird looking link
    const message = `
          <h1>You have requested to reset your password</h1>
          <p>Please go to this link to reset your password:</p>
          <a href=${link} clicktracking=off>${link}</a>
      `;
  
    try {
      await sendMail(email, "ExpenseTrackify - Reset password", message);
      res.status(200).json({message: "Email sent." });
    } catch (err) {
      res.status(500).json({error: "Email could not be sent." });
    }
  };