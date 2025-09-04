import React, { useState } from "react";
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ActivityIndicator 
} from "react-native";
import { supabase } from "../supabase/supabaseClient";

const ForgotPasswordScreen: React.FC = () => {
  const [email, setEmail] = useState<string>("");
  const [otp, setOtp] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [isOtpSent, setIsOtpSent] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  // Step 1: Send OTP via email (using resetPasswordForEmail).
  // With your custom email template, the user receives an OTP instead of a magic link.
  const handleSendOtp = async () => {
    if (!email) {
      Alert.alert("Error", "Please enter your email.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setIsOtpSent(true);
      Alert.alert("Success", "An OTP code has been sent to your email.");
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify the OTP and update the password.
  const handleVerifyOtpAndResetPassword = async () => {
    if (!otp || !newPassword) {
      Alert.alert("Error", "Please enter both the OTP and your new password.");
      return;
    }
    setLoading(true);
    try {
      // Verify the OTP; this should log the user in if successful.
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "email", // Using "email" to specify that it's an OTP for email.
      });
      if (verifyError) throw verifyError;
      
      // Once verified, update the user's password.
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;
      
      Alert.alert("Success", "Your password has been updated successfully!");
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {!isOtpSent ? (
        <>
          <Text style={styles.title}>Reset Your Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TouchableOpacity style={styles.button} onPress={handleSendOtp} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Send OTP</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.title}>Enter OTP & New Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter OTP"
            keyboardType="number-pad"
            value={otp}
            onChangeText={setOtp}
          />
          <TextInput
            style={styles.input}
            placeholder="Enter new password"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <TouchableOpacity style={styles.button} onPress={handleVerifyOtpAndResetPassword} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Reset Password</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
    color: "#333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginVertical: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default ForgotPasswordScreen;
