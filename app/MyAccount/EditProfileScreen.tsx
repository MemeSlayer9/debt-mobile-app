import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { supabase } from "../supabase/supabaseClient";
import { useUser } from "../context/UserContext";
import { RootStackParamList } from "../navigation/navigationTypes";

type EditProfileScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, "EditProfile">;
};

const EditProfileScreen: React.FC<EditProfileScreenProps> = ({ navigation }) => {
  const { user, setUser } = useUser();
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState(""); 
  const [lastName, setLastName] = useState(""); 
  const [phoneNumber, setPhoneNumber] = useState(""); 
  const [email, setEmail] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fallback: If user or user.id is missing, try to fetch the session.
  useEffect(() => {
    const loadUserSession = async () => {
      if (!user || !user.id) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          setUser({
            id: session.user.id,
            username: session.user.user_metadata.username,
            profileImage: session.user.user_metadata.avatar_url,
          });
        } else {
          Alert.alert("Error", "User not found. Please log in again.");
          navigation.replace("Login");
        }
      }
    };
    loadUserSession();
  }, [user, setUser, navigation]);

  // Load profile details from Supabase if user exists.
  useEffect(() => {
    const loadProfile = async () => {
      if (!user || !user.id) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("profile")
        .select("*")
        .eq("id", user.id)
        .single();
      setLoading(false);
      if (error) {
        Alert.alert("Error", "Failed to load profile: " + error.message);
      } else if (data) {
        setUsername(data.username);
        setEmail(data.email);
        setImageUri(data.profile_image);
        setFirstName(data.first_name || "");
        setLastName(data.last_name || "");
        setPhoneNumber(data.phone_number || "");
      }
    };
    loadProfile();
  }, [user]);

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
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const arrayBuffer = Buffer.from(base64, "base64");
      const extension = imageUri.split(".").pop() || "jpg";
      const fileName = `profile_${userId}_${Date.now()}.${extension}`;
      const { data, error } = await supabase.storage
        .from("profile_images")
        .upload(fileName, arrayBuffer, {
          contentType: `image/${extension}`,
        });
      if (error) throw error;
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

  const handleUpdateProfile = async () => {
    if (!username || !email) {
      Alert.alert("Error", "Username and Email are required.");
      return;
    }
    if (!validateEmail(email)) {
      Alert.alert("Error", "Invalid email format.");
      return;
    }
    if (!user || !user.id) {
      Alert.alert("Error", "User not found. Please log in again.");
      navigation.replace("Login");
      return;
    }
    try {
      let imageUrl = imageUri;
      if (imageUri && imageUri.startsWith("file://")) {
        imageUrl = await uploadImageToSupabase(imageUri, user.id);
      }
      // Update the profile record in Supabase with the new fields.
      const { error } = await supabase
        .from("profile")
        .update({
          username,
          email,
          first_name: firstName,
          last_name: lastName,
          phone_number: phoneNumber,
          profile_image: imageUrl,
        })
        .eq("id", user.id);
      if (error) throw error;
      // Update the UserContext.
      setUser({ ...user, username, profileImage: imageUrl || user.profileImage });
      Alert.alert("Success", "Profile updated successfully!", [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error: any) {
      console.error("Profile Update Error:", error);
      Alert.alert("Error", error.message || "Profile update failed");
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading Profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Edit Profile</Text>
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
      <TouchableOpacity style={styles.button} onPress={handleUpdateProfile}>
        <Text style={styles.buttonText}>Save Profile</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    alignSelf: "center",
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
  imagePicker: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    alignSelf: "center",
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

export default EditProfileScreen;
