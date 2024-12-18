# Contributing to the Project

Thank you for your interest in contributing! This guide will walk you through the process of setting up the project locally, so you can start contributing right away.

## Prerequisites

Before you start, make sure you have the following installed:

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) (version 14.x or higher)
- [npm](https://www.npmjs.com/) (Node Package Manager)

## Setup Instructions

### 1. Clone the `alpha` Branch of the `refact-chat-js` Repository

Start by cloning the `alpha` branch of the `refact-chat-js` repository:

```bash
git clone -b alpha https://github.com/your-username/refact-chat-js.git
cd refact-chat-js

2. Install Dependencies and Build the Project
Once inside the refact-chat-js project folder, install the dependencies and build the project:
npm ci        # Clean install of dependencies
npm run build # Build the project
npm link      # Create a global symlink to the project

3. Clone the dev Branch of the refact-vscode Repository
Next, in a new directory, clone the dev branch of the refact-vscode repository:
git clone -b dev https://github.com/your-username/refact-vscode.git
cd refact-vscode

4. Link refact-chat-js to refact-vscode
Link the refact-chat-js project to the refact-vscode project by running:
npm link refact-chat-js

5. Compile the refact-vscode Project
Now, compile the refact-vscode project:
npm run compile

6. Open the IDE and Build the Project
Open your IDE (e.g., Visual Studio Code) and load the refact-vscode project. Rebuild the project to apply the changes.

7. Update Settings for Chat Functionality
To enable the latest chat features, go to the settings and change the following option:

- refactai.xDebug: Set the value from null to 1.

8. Test the Chat Functionality
Once you've completed the setup, you can test the chat functionality to ensure that the latest features are working properly.




