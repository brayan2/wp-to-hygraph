# wp-to-hygraph

A powerful and opinionated Node.js script designed to automate the migration of content from a WordPress site to a Hygraph project. This script leverages the WordPress REST API and the Hygraph GraphQL API to seamlessly transfer posts, authors, categories, featured images, and even comments.

## ✨ Features

- **Full Content Migration:** Moves all essential content types: **posts**, **authors**, **categories**, **assets** (featured images), and **comments**.
- **Idempotent Operations:** Skips content items that already exist in the Hygraph project based on unique identifiers (like post slugs or file names) to prevent duplicates on subsequent runs.
- **Two-Step Asset Uploads:** Utilizes the modern Hygraph two-step asset upload process (creating an entry and then uploading to a pre-signed S3 URL) for robust and efficient media migration.
- **Rich Text Conversion:** Converts HTML content from WordPress posts into the Hygraph-compatible RichTextAST format.
- **Robust Error Handling:** Provides clear console feedback on success and failure for each content item.
- **Relationship Management:** Automatically connects posts to their respective authors and categories in Hygraph.

## ⚙️ How It Works

1.  The script fetches all authors, posts, categories, and comments from the WordPress REST API.
2.  It queries the Hygraph API to find existing content, creating a map of existing items to avoid re-migration.
3.  It iterates through the fetched WordPress data:
    -   **Authors:** Creates new authors in Hygraph if they don't exist.
    -   **Categories:** Creates new categories and publishes them immediately to be available for posts.
    -   **Assets:** Downloads featured images from WordPress and uploads them to Hygraph using a two-step process.
    -   **Posts:** Creates a new blog post entry in Hygraph, converting the content to RichText, and linking it to the correct author and featured image.
4.  After all content items are created, it performs a second pass to publish all new posts, comments, and authors.
5.  Finally, it updates the relationships, connecting posts to their migrated categories.

## 🚀 Getting Started

### Prerequisites

-   A working WordPress installation with a REST API endpoint.
-   A Hygraph project with a schema that matches the expected content types (`BlogPost`, `Author`, `Category`, `Comment`).
-   Node.js installed on your machine.
-   Access to your WordPress REST API (this script uses basic authentication).

### Installation

1.  Clone this repository to your local machine:
    ```bash
    git clone [https://github.com/brayan2/wp-to-hygraph.git](https://github.com/brayan2/wp-to-hygraph.git)
    cd wp-to-hygraph
    ```
2.  Install the required Node.js packages:
    ```bash
    npm install
    ```

### Configuration

Create a `.env` file in the root of the project with your Hygraph API credentials. 

HYGRAPH_API=YOUR_HYGRAPH_API_ENDPOINT
HYGRAPH_TOKEN=YOUR_HYGRAPH_PERMANENT_AUTH_TOKEN

### Update the WordPress API endpoint in migrate.js:

const WP_API = 'https://your-wordpress-site.com/wp-json/wp/v2';
const WP_AUTH = 'Basic ' + Buffer.from('username:password').toString('base64');

### Running the Migration

Execute the script from your terminal:

```bash
node migrate.js
```
The console will log the migration progress, showing which items are being created, skipped, and published.

### ⚠️ Important Notes

This script assumes the Hygraph schema is already defined and matches the structure used in the GraphQL mutations.

The WordPress API endpoint and basic authentication credentials are hardcoded in migrate.js. Remember to update WP_API and WP_AUTH with your own details before running.

The script handles the migration of content, but it does not migrate comments with missing author_name or content.