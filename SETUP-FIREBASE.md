# Setting up the shared family log (Firebase)

Pump Track uses the **same Firebase project as Twin Track**, so Google sign-in and the database are already set up.
The only thing left is one rules change that lets your family read and write the new `pumps` collection. It takes about 2 minutes.

## 1. Let the family use Pump Track
1. Go to https://console.firebase.google.com, sign in, and open the **twin-track** project.
2. Left menu: **Build → Firestore Database**, then open the **Rules** tab.
3. Add this block next to the existing `match /events/{eventId}` block, inside `match /databases/{database}/documents { ... }`:

   ```
   match /pumps/{pumpId} {
     allow read, write: if isFamily();
   }
   ```

   [`firestore.rules`](firestore.rules) shows the complete rules for both apps.
   Keep your real email addresses in the console, and don't copy the placeholder addresses over them.
4. Click **Publish**.

`iofreqinmo.github.io` is already an authorized sign-in domain from Twin Track, so nothing else needs to change.

## 2. Use it
Open the app and tap **Sign in with Google**. If you're already signed in to Twin Track in the same browser, you may be signed in already.
Everyone signed in sees the same pumps within a second or two. Pumps logged with no signal are saved on the phone and upload when it reconnects.

If the app says your account "isn't on the family list", the rules from step 1 haven't been published yet, or the email isn't in the list.

### If sign-in doesn't work from the home-screen app
Some iPhones block the Google sign-in window inside home-screen apps. If that happens, delete the home-screen icon, sign in once in Safari, and then re-add it to the home screen from Safari.

## Later: changing the rules for Twin Track
Both apps share one set of rules. When you edit them, keep both the `events` and `pumps` blocks, or the app you left out will stop working.
