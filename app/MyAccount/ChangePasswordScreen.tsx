import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../supabase/supabaseClient";

const ChangePasswordScreen = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const navigation = useNavigation();

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }

    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert("Success", "Password updated successfully.");
      navigation.goBack();
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Change Password</Text>
      <TextInput
        placeholder="New Password"
        style={styles.input}
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
      />
      <TextInput
        placeholder="Confirm Password"
        style={styles.input}
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />
      <TouchableOpacity style={styles.button} onPress={handleChangePassword}>
        <Text style={styles.buttonText}>Submit</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  header: {
    fontSize: 24,
    color: "#006A6A",
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#C0C0C0",
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#006A6A",
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
});

export default ChangePasswordScreen;
