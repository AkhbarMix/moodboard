import { auth } from "./firebase";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "firebase/auth";

export async function signupEmail(email: string, password: string) {
  const res = await createUserWithEmailAndPassword(auth, email, password);
  return res.user;
}

export async function loginEmail(email: string, password: string) {
  const res = await signInWithEmailAndPassword(auth, email, password);
  return res.user;
}

export async function loginGoogle() {
  const provider = new GoogleAuthProvider();
  const res = await signInWithPopup(auth, provider);
  return res.user;
}

export async function logout() {
  await signOut(auth);
}
