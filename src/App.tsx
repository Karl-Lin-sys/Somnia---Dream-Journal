/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { ApiKeyPrompt } from "./components/ApiKeyPrompt";
import { DreamJournal } from "./components/DreamJournal";

export default function App() {
  const [hasKey, setHasKey] = useState(false);

  if (!hasKey) {
    return <ApiKeyPrompt onKeySelected={() => setHasKey(true)} />;
  }

  return <DreamJournal />;
}
