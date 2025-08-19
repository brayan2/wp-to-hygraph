// migrate.js
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { gql, GraphQLClient } from 'graphql-request';
import { JSDOM } from 'jsdom';
import FormData from 'form-data';
import path from 'path';
import { URL } from 'url';

dotenv.config();

// ---------- CONFIG ----------
const WP_API = 'https://equal-oil.localsite.io/wp-json/wp/v2';
const WP_AUTH = 'Basic ' + Buffer.from('tortoise:sincere').toString('base64');

const HYGRAPH_API = process.env.HYGRAPH_API;
const HYGRAPH_TOKEN = process.env.HYGRAPH_TOKEN;

if (!HYGRAPH_API || !HYGRAPH_TOKEN) {
  console.error('❌ Set HYGRAPH_API and HYGRAPH_TOKEN in .env');
  process.exit(1);
}

const client = new GraphQLClient(HYGRAPH_API, {
  headers: { Authorization: `Bearer ${HYGRAPH_TOKEN}` },
});

// ---------- HELPERS ----------
async function fetchWordPressData() {
  const options = { headers: { Authorization: WP_AUTH } };
  const [authorsResponse, postsResponse, categoriesResponse, commentsResponse] = await Promise.all([
    fetch(`${WP_API}/users?per_page=100`, options),
    fetch(`${WP_API}/posts?_embed&per_page=100`, options),
    fetch(`${WP_API}/categories?per_page=100`, options),
    fetch(`${WP_API}/comments?per_page=100`, options),
  ]);

  if (!authorsResponse.ok || !postsResponse.ok || !categoriesResponse.ok || !commentsResponse.ok) {
    throw new Error('Failed to fetch WordPress data.');
  }

  const authors = await authorsResponse.json();
  const posts = await postsResponse.json();
  const categories = await categoriesResponse.json();
  const comments = await commentsResponse.json();

  return { authors, posts, categories, comments };
}

function convertToRichTextAST(htmlString) {
  if (!htmlString || htmlString.trim() === '') return { children: [] };

  const dom = new JSDOM(htmlString);
  const doc = dom.window.document;
  const children = [];

  doc.body.childNodes.forEach(node => {
    if (node.nodeType === 1) { // Element node
      if (node.tagName === 'P') {
        if (node.textContent.trim()) {
          children.push({ type: 'paragraph', children: [{ text: node.textContent.trim() }] });
        }
      } else if (node.tagName === 'UL') {
        const listItems = [];
        node.querySelectorAll('li').forEach(li => {
          if (li.textContent.trim()) {
            listItems.push({ type: 'list-item', children: [{ type: 'list-item-child', children: [{ text: li.textContent.trim() }] }] });
          }
        });
        if (listItems.length > 0) {
          children.push({ type: 'bulleted-list', children: listItems });
        }
      }
    }
  });

  return { children };
}

// ---------- GRAPHQL QUERIES & MUTATIONS ----------
const GET_EXISTING_AUTHORS_QUERY = gql`
  query GetExistingAuthors {
    authors {
      name
      id
    }
  }
`;

const GET_EXISTING_POSTS_QUERY = gql`
  query GetExistingPosts {
    blogPosts(where: { slug_not_in: ["hello-world", "sample-page"] }) {
      id
      slug
    }
  }
`;

const GET_EXISTING_ASSETS_QUERY = gql`
  query GetExistingAssets {
    assets {
      fileName
      id
    }
  }
`;

const GET_EXISTING_CATEGORIES_QUERY = gql`
  query GetExistingCategories {
    categories {
      categorySlug
      id
    }
  }
`;

const CREATE_AUTHOR_MUTATION = gql`
  mutation CreateAuthor($name: String!, $about: String) {
    createAuthor(data: { name: $name, about: $about }) {
      id
    }
  }
`;

const CREATE_POST_MUTATION = gql`
  mutation CreateBlogPost(
    $title: String!
    $slug: String!
    $excerpt: String!
    $description: RichTextAST!
    $authorId: ID!
    $featuredImageId: ID
  ) {
    createBlogPost(
      data: {
        title: $title
        slug: $slug
        excerpt: $excerpt
        description: $description
        author: { connect: { id: $authorId } }
        featuredImage: { connect: { id: $featuredImageId } }
      }
    ) {
      id
      title
    }
  }
`;

const CREATE_CATEGORY_MUTATION = gql`
  mutation CreateCategory($name: String!, $slug: String!, $description: String) {
    createCategory(data: { categoryName: $name, categorySlug: $slug, categoryDescription: $description }) {
      id
    }
  }
`;

const UPDATE_POST_CATEGORIES_MUTATION = gql`
  mutation UpdateBlogPost($id: ID!, $categoryConnects: [CategoryWhereUniqueInput!]!) {
    updateBlogPost(
      where: { id: $id }
      data: { category: { set: $categoryConnects } }
    ) {
      id
    }
  }
`;

const PUBLISH_POST_MUTATION = gql`
  mutation PublishBlogPost($id: ID!) {
    publishBlogPost(where: { id: $id }, to: PUBLISHED) {
      id
    }
  }
`;

const PUBLISH_AUTHOR_MUTATION = gql`
  mutation PublishAuthor($id: ID!) {
    publishAuthor(where: { id: $id }, to: PUBLISHED) {
      id
    }
  }
`;

const PUBLISH_ASSET_MUTATION = gql`
  mutation PublishAsset($id: ID!) {
    publishAsset(where: { id: $id }, to: PUBLISHED) {
      id
    }
  }
`;

const PUBLISH_CATEGORY_MUTATION = gql`
  mutation PublishCategory($id: ID!) {
    publishCategory(where: { id: $id }, to: PUBLISHED) {
      id
    }
  }
`;

const CREATE_ASSET_MUTATION = gql`
  mutation CreateAsset($name: String) {
    createAsset(data: { fileName: $name }) {
      id
      upload {
        requestPostData {
          url
          date
          key
          signature
          algorithm
          policy
          credential
          securityToken
        }
      }
    }
  }
`;

const UPDATE_ASSET_METADATA_MUTATION = gql`
  mutation UpdateAsset($id: ID!, $altText: String, $caption: String) {
    updateAsset(where: { id: $id }, data: { altText: $altText, caption: $caption }) {
      id
    }
  }
`;

const CREATE_COMMENT_MUTATION = gql`
  mutation CreateComment(
    $blogPostComment: String!
    $userName: String!
    $userEmail: String!
    $userWebsite: String
    $blogPostId: ID!
  ) {
    createComment(
      data: {
        blogPostComment: $blogPostComment
        userName: $userName
        userEmail: $userEmail
        userWebsite: $userWebsite
        blogPost: { connect: { id: $blogPostId } }
      }
    ) {
      id
    }
  }
`;

const PUBLISH_COMMENT_MUTATION = gql`
  mutation PublishComment($id: ID!) {
    publishComment(where: { id: $id }, to: PUBLISHED) {
      id
    }
  }
`;


// ---------- ASSET CREATION (Using modern two-step upload) ----------
async function createAndPopulateAsset(imageUrl, altText, caption, existingAssetsMap) {
  try {
    const fileName = path.basename(new URL(imageUrl).pathname);

    if (existingAssetsMap.has(fileName)) {
      const assetId = existingAssetsMap.get(fileName);
      console.log(`   ⏩ Skipping asset: ${fileName} already exists with ID: ${assetId}`);
      return assetId;
    }

    console.log(`   📥 Downloading asset: ${imageUrl}`);
    const imageResponse = await fetch(imageUrl, { headers: { Authorization: WP_AUTH } });
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image. Status: ${imageResponse.status}`);
    }
    const imageBuffer = await imageResponse.arrayBuffer();

    console.log(`   ✍️ Creating asset entry on Hygraph and getting pre-signed URL...`);
    const createAssetRes = await client.request(CREATE_ASSET_MUTATION, { name: fileName });

    const assetId = createAssetRes.createAsset.id;
    const uploadData = createAssetRes.createAsset.upload.requestPostData;
    const uploadUrl = uploadData.url;

    if (!uploadData) {
      throw new Error("Failed to get pre-signed upload URL from Hygraph.");
    }

    const form = new FormData();
    form.append('key', uploadData.key);
    form.append('policy', uploadData.policy);
    form.append('x-amz-signature', uploadData.signature);
    form.append('x-amz-credential', uploadData.credential);
    form.append('x-amz-algorithm', uploadData.algorithm);
    form.append('x-amz-date', uploadData.date);
    form.append('x-amz-security-token', uploadData.securityToken);
    form.append('file', Buffer.from(imageBuffer), fileName);

    console.log(`   📤 Uploading asset to Hygraph's S3 endpoint...`);
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: form,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload to S3 failed. Status: ${uploadResponse.status}, Body: ${errorText}`);
    }

    console.log(`   🖼️ Updating asset metadata (altText, caption) for asset ID: ${assetId}`);
    await client.request(UPDATE_ASSET_METADATA_MUTATION, {
        id: assetId,
        altText,
        caption
    });
    
    console.log(`   ✅ Created, uploaded, and updated asset: ${fileName} -> ID: ${assetId}`);
    return assetId;
  } catch (err) {
    console.error(`   ❌ Failed to create asset for ${imageUrl}:`, err.message);
    return null;
  }
}

// ---------- MAIN MIGRATION ----------
async function migrate() {
  try {
    // 0️⃣ Check for existing content in Hygraph to avoid duplicates
    console.log('--- Checking for existing content in Hygraph ---');
    const existingAuthorsRes = await client.request(GET_EXISTING_AUTHORS_QUERY);
    const existingAuthorsMap = new Map(existingAuthorsRes.authors.map(a => [a.name, a.id]));
    console.log(`Found ${existingAuthorsMap.size} existing authors.`);

    const existingPostsRes = await client.request(GET_EXISTING_POSTS_QUERY);
    const existingPostsMap = new Map(existingPostsRes.blogPosts.map(p => [p.slug, p.id]));
    console.log(`Found ${existingPostsMap.size} existing posts.`);

    const existingAssetsRes = await client.request(GET_EXISTING_ASSETS_QUERY);
    const existingAssetsMap = new Map(existingAssetsRes.assets.map(a => [a.fileName, a.id]));
    console.log(`Found ${existingAssetsMap.size} existing assets.`);

    const existingCategoriesRes = await client.request(GET_EXISTING_CATEGORIES_QUERY);
    const existingCategoriesMap = new Map(existingCategoriesRes.categories.map(c => [c.categorySlug, c.id]));
    console.log(`Found ${existingCategoriesMap.size} existing categories.`);
    
    console.log('--- Fetching WordPress Data ---');
    const { authors, posts, categories, comments } = await fetchWordPressData();
    
    const authorMap = {}; 
    const wpCategorySlugMap = {}; 
    const authorHygraphIdsToPublish = new Set();
    const newAssetsToPublish = [];
    const newPostsToPublish = [];
    const postsToUpdateWithCategories = new Map();
    const wpPostIdToHygraphId = new Map(); 
    const newCommentsToPublish = new Set(); 

    // --- Pass 1: Create all content items as drafts ---
    // 1️⃣ Create or find authors
    console.log('\n--- Migrating Authors ---');
    for (const a of authors) {
      if (a.slug === 'hygraphexport') continue;
      const existingAuthorId = existingAuthorsMap.get(a.name);
      if (existingAuthorId) {
        authorMap[a.id] = existingAuthorId;
        authorHygraphIdsToPublish.add(existingAuthorId);
        console.log(`   ⏩ Skipping author "${a.name}" — already exists with ID: ${existingAuthorId}`);
      } else {
        try {
          const res = await client.request(CREATE_AUTHOR_MUTATION, {
            name: a.name,
            about: a.description || '',
          });
          const hygraphAuthorId = res.createAuthor.id;
          authorMap[a.id] = hygraphAuthorId;
          authorHygraphIdsToPublish.add(hygraphAuthorId);
          console.log(`✅ Created author: ${a.name}`);
        } catch (err) {
          console.error(`❌ Failed to create author "${a.name}":`, err.message);
        }
      }
    }

    // 2️⃣ Create or find categories
    const categoriesToPublish = new Set();
    console.log('\n--- Migrating Categories ---');
    for (const c of categories) {
      const existingCategoryId = existingCategoriesMap.get(c.slug);
      if (existingCategoryId) {
        wpCategorySlugMap[c.id] = c.slug;
        categoriesToPublish.add(existingCategoryId);
        console.log(`   ⏩ Skipping category "${c.name}" — already exists with ID: ${existingCategoryId}`);
      } else {
        try {
          const res = await client.request(CREATE_CATEGORY_MUTATION, {
            name: c.name,
            slug: c.slug,
            description: c.description || ''
          });
          const hygraphCategoryId = res.createCategory.id;
          wpCategorySlugMap[c.id] = c.slug;
          categoriesToPublish.add(hygraphCategoryId);
          console.log(`✅ Created category: ${c.name}`);
        } catch (err) {
          console.error(`❌ Failed to create category "${c.name}":`, err.message);
        }
      }
    }
    
    // 3️⃣ Publish all categories (new and existing) now. This is essential before we connect posts.
    console.log('\n--- Publishing Categories ---');
    for (const categoryId of categoriesToPublish) {
      try {
        await client.request(PUBLISH_CATEGORY_MUTATION, { id: categoryId });
        console.log(`✅ Published category ID: ${categoryId}`);
      } catch (err) {
        console.error(`❌ Failed to publish category ID "${categoryId}":`, err.message);
      }
    }
    
    // 4️⃣ Create new posts and assets (as drafts)
    console.log('\n--- Migrating New Posts & Assets ---');
    for (const post of posts) {
      if (post.status !== 'publish' || post.slug === 'hello-world' || post.slug === 'sample-page') {
        continue;
      }
      
      const existingPostId = existingPostsMap.get(post.slug);
      let postId;
      
      if (existingPostId) {
        postsToUpdateWithCategories.set(existingPostId, {
          wpTitle: post.title.rendered,
          wpCategories: post.categories
        });
        wpPostIdToHygraphId.set(post.id, existingPostId);
        console.log(`   ⏩ Skipping post "${post.title.rendered}" — already exists with ID: ${existingPostId}`);
        continue;
      }

      console.log(`Migrating post: ${post.title.rendered}`);
      const authorId = authorMap[post.author];
      if (!authorId) {
        console.warn(`   ⚠️ Skipping post "${post.title.rendered}" — missing author. Make sure the author exists in Hygraph.`);
        continue;
      }

      let featuredImageId = null;
      if (post._embedded && post._embedded['wp:featuredmedia']) {
        const media = post._embedded['wp:featuredmedia'][0];
        if (media?.source_url) {
          const altText = media.alt_text || '';
          const caption = media.caption?.rendered?.replace(/<[^>]+>/g, '').trim() || '';
          featuredImageId = await createAndPopulateAsset(media.source_url, altText, caption, existingAssetsMap);
          if (featuredImageId) {
            newAssetsToPublish.push(featuredImageId);
          }
        }
      }

      const description = convertToRichTextAST(post.content.rendered);
      const excerpt = post.excerpt?.rendered?.replace(/<[^>]+>/g, '').trim() || '';
      
      const createPostVariables = {
        title: post.title.rendered,
        slug: post.slug,
        excerpt,
        description,
        authorId,
        featuredImageId
      };
      
      try {
        const createPostRes = await client.request(CREATE_POST_MUTATION, createPostVariables);
        postId = createPostRes.createBlogPost.id;
        newPostsToPublish.push(postId);
        postsToUpdateWithCategories.set(postId, {
          wpTitle: post.title.rendered,
          wpCategories: post.categories
        });
        wpPostIdToHygraphId.set(post.id, postId);
        console.log(`✅ Created post: ${post.title.rendered}`);
      } catch (err) {
        console.error(`❌ Failed to create post "${post.title.rendered}":`, err.message);
        if (err.response?.errors) {
          console.error('GraphQL errors:', JSON.stringify(err.response.errors, null, 2));
        }
      }
    }

    // ✨ **MODIFIED BLOCK**: Create Comments and link them to posts
    console.log('\n--- Migrating Comments ---');
    for (const comment of comments) {
      if (comment.status !== 'approved') {
        console.log(`   ⏩ Skipping unapproved comment ID: ${comment.id}`);
        continue;
      }

      const hygraphPostId = wpPostIdToHygraphId.get(comment.post);
      if (!hygraphPostId) {
        console.warn(`   ⚠️ Skipping comment ID ${comment.id} — its corresponding post was not migrated.`);
        continue;
      }
      
      const commentText = comment.content.rendered.replace(/<[^>]+>/g, '').trim();
      // 👇 **FIX**: Relaxed the check to only validate essential data we know should exist.
      if (!commentText || !comment.author_name) {
          console.warn(`   ⚠️ Skipping comment ID ${comment.id} by "${comment.author_name || 'unknown'}" due to missing author name or content.`);
          continue;
      }

      try {
        // 👇 **FIX**: Use the real email if it exists, otherwise use a unique placeholder.
        const userEmail = comment.author_email || `user.id-${comment.author || comment.id}@placeholder.invalid`;

        const createCommentRes = await client.request(CREATE_COMMENT_MUTATION, {
          blogPostComment: commentText,
          userName: comment.author_name,
          userEmail: userEmail,
          userWebsite: comment.author_url || '',
          blogPostId: hygraphPostId,
        });
        const newCommentId = createCommentRes.createComment.id;
        newCommentsToPublish.add(newCommentId);
        console.log(`✅ Created comment by "${comment.author_name}" for Hygraph post ID ${hygraphPostId}`);
      } catch (err) {
        console.error(`❌ Failed to create comment for post ID ${comment.post}:`, err.message);
        if (err.response?.errors) {
            console.error('GraphQL errors:', JSON.stringify(err.response.errors, null, 2));
        }
      }
    }
    
    // --- Pass 2: Publish and update relationships for all content ---
    
    // 5️⃣ Publish all new assets and posts first.
    console.log('\n--- Publishing New Assets ---');
    for (const assetId of newAssetsToPublish) {
      try {
        await client.request(PUBLISH_ASSET_MUTATION, { id: assetId });
        console.log(`✅ Published new asset ID: ${assetId}`);
      } catch (err) {
        console.error(`❌ Failed to publish new asset ID "${assetId}":`, err.message);
      }
    }

    console.log('\n--- Publishing New Posts ---');
    for (const postId of newPostsToPublish) {
      try {
        await client.request(PUBLISH_POST_MUTATION, { id: postId });
        console.log(`✅ Published new post ID: ${postId}`);
      } catch (err) {
        console.error(`❌ Failed to publish new post ID "${postId}":`, err.message);
      }
    }

    console.log('\n--- Publishing Comments ---');
    for (const commentId of newCommentsToPublish) {
      try {
        await client.request(PUBLISH_COMMENT_MUTATION, { id: commentId });
        console.log(`✅ Published comment ID: ${commentId}`);
      } catch (err) {
        console.error(`❌ Failed to publish comment ID "${commentId}":`, err.message);
      }
    }

    // 6️⃣ Update relationships for both new and existing posts.
    console.log('\n--- Updating Posts with Categories ---');
    for (const [postId, postData] of postsToUpdateWithCategories) {
      if (postData.wpCategories && postData.wpCategories.length > 0) {
        const hygraphCategoryConnects = postData.wpCategories
          .map(wpCategoryId => wpCategorySlugMap[wpCategoryId])
          .filter(Boolean)
          .map(slug => ({ categorySlug: slug }));
          
        if (hygraphCategoryConnects.length > 0) {
          try {
            await client.request(UPDATE_POST_CATEGORIES_MUTATION, {
              id: postId,
              categoryConnects: hygraphCategoryConnects
            });
            console.log(`✅ Updated post "${postData.wpTitle}" with categories.`);
            if (!newPostsToPublish.includes(postId)) {
                await client.request(PUBLISH_POST_MUTATION, { id: postId });
                console.log(`✅ Published updated post ID: ${postId}`);
            }
          } catch (err) {
            console.error(`❌ Failed to update post "${postData.wpTitle}" with categories:`, err.message);
            if (err.response?.errors) {
              console.error('GraphQL errors:', JSON.stringify(err.response.errors, null, 2));
            }
          }
        } else {
          console.log(`   ⏩ Post "${postData.wpTitle}" has no categories to update.`);
        }
      }
    }

    // 7️⃣ Publish authors
    console.log('\n--- Publishing Authors ---');
    for (const hygraphAuthorId of authorHygraphIdsToPublish) {
      try {
        await client.request(PUBLISH_AUTHOR_MUTATION, { id: hygraphAuthorId });
        console.log(`✅ Published author ID: ${hygraphAuthorId}`);
      } catch (err) {
        console.error(`❌ Failed to publish author ID "${hygraphAuthorId}":`, err.message);
      }
    }

    console.log('\n🎉 Migration complete!');
  } catch (err) {
    console.error('❌ Migration error:', err.message || err);
    if (err.response?.data) console.error('Response data:', JSON.stringify(err.response.data, null, 2));
  }
}

migrate();