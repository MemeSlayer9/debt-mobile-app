import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ScrollView,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { supabase } from "../supabase/supabaseClient";

type RootStackParamList = {
  Login: undefined;
  Register: undefined;
};

type CreateAccountScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, "Register">;
};

const CreateAccountScreen: React.FC<CreateAccountScreenProps> = ({ navigation }) => {
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required!", "Need camera roll access to upload images");
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0].uri) {
      setImageUri(result.assets[0].uri);
    }
  };

  const uploadImageToSupabase = async (imageUri: string, userId: string) => {
    try {
      // Read file content using Expo FileSystem
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      // Convert to Uint8Array
      const arrayBuffer = Buffer.from(base64, "base64");
      const extension = imageUri.split(".").pop() || "jpg";
      const fileName = `profile_${userId}_${Date.now()}.${extension}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from("profile_images")
        .upload(fileName, arrayBuffer, {
          contentType: `image/${extension}`,
        });
      if (error) throw error;
      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from("profile_images")
        .getPublicUrl(data.path);
      return publicUrlData.publicUrl;
    } catch (error: any) {
      console.error("Image Upload Error:", error);
      throw new Error("Failed to upload image");
    }
  };

  const validateEmail = (email: string) => /\S+@\S+\.\S+/.test(email);

  const handleCreateAccount = async () => {
    if (!username || !firstName || !lastName || !phoneNumber || !email || !password || !confirmPassword) {
      Alert.alert("Error", "All fields are required.");
      return;
    }
    if (!validateEmail(email)) {
      Alert.alert("Error", "Invalid email format.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    try {
      // Check username availability
      const { data: existingUsers, error: usernameError } = await supabase
        .from("profile")
        .select("id")
        .eq("username", username);
      if (usernameError) throw usernameError;
      if (existingUsers && existingUsers.length > 0) {
        Alert.alert("Error", "Username already taken");
        return;
      }

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error("User creation failed");

      // Upload image if exists
      let imageUrl = null;
      if (imageUri) {
        imageUrl = await uploadImageToSupabase(imageUri, authData.user.id);
      }

      // Create profile record with additional fields
      const { error: profileError } = await supabase.from("profile").insert({
        id: authData.user.id,
        username,
        email,
        first_name: firstName,
        last_name: lastName,
        phone_number: phoneNumber,
        profile_image: imageUrl,
      });
      if (profileError) throw profileError;

      Alert.alert("Success", "Account created!", [
        { text: "OK", onPress: () => navigation.navigate("Login") },
      ]);
    } catch (error: any) {
      console.error("Registration Error:", error);
      Alert.alert("Error", error.message || "Registration failed");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Account</Text>

      <TouchableOpacity onPress={pickImage} style={styles.imagePicker}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.profileImage} />
        ) : (
          <Text style={styles.imagePlaceholder}>Add Profile Photo</Text>
        )}
      </TouchableOpacity>

      <TextInput
        style={styles.input}
        placeholder="Username"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="First Name"
        autoCapitalize="words"
        value={firstName}
        onChangeText={setFirstName}
      />
      <TextInput
        style={styles.input}
        placeholder="Last Name"
        autoCapitalize="words"
        value={lastName}
        onChangeText={setLastName}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone Number"
        keyboardType="phone-pad"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      <TouchableOpacity style={styles.button} onPress={handleCreateAccount}>
        <Text style={styles.buttonText}>Create Account</Text>
      </TouchableOpacity>

      <Text style={styles.footerText}>
        Already have an account?{" "}
        <Text style={styles.loginText} onPress={() => navigation.navigate("Login")}>
          Login
        </Text>
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#27AE60",
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 15,
  },
  button: {
    backgroundColor: "#006A6A",
    width: "100%",
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    marginTop: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  footerText: {
    marginTop: 15,
    fontSize: 14,
    textAlign: "center",
  },
  loginText: {
    color: "#F39C12",
    fontWeight: "bold",
  },
  imagePicker: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  profileImage: {
    width: "100%",
    height: "100%",
    borderRadius: 60,
  },
  imagePlaceholder: {
    color: "#888",
  },
});

export default CreateAccountScreen;
