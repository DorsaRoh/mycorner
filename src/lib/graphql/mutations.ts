import { gql } from '@apollo/client';

// Fragment for block style to avoid repetition
const BLOCK_STYLE_FRAGMENT = `
  style {
    borderRadius
    shadowStrength
    shadowSoftness
    shadowOffsetX
    shadowOffsetY
    fontFamily
    fontSize
    fontWeight
    color
    textOpacity
  }
`;

const BLOCK_EFFECTS_FRAGMENT = `
  effects {
    brightness
    contrast
    saturation
    hueShift
    blur
  }
`;

// Fragment for background config to avoid repetition
const BACKGROUND_FRAGMENT = `
  background {
    mode
    solid {
      color
    }
    gradient {
      type
      colorA
      colorB
      angle
    }
  }
`;

export const CREATE_PAGE = gql`
  mutation CreatePage($input: CreatePageInput) {
    createPage(input: $input) {
      id
      title
      isPublished
      blocks {
        id
        type
        x
        y
        width
        height
        content
      }
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_PAGE = gql`
  mutation UpdatePage($id: ID!, $input: UpdatePageInput!) {
    updatePage(id: $id, input: $input) {
      page {
        id
        title
        blocks {
          id
          type
          x
          y
          width
          height
          content
          ${BLOCK_STYLE_FRAGMENT}
          ${BLOCK_EFFECTS_FRAGMENT}
        }
        ${BACKGROUND_FRAGMENT}
        updatedAt
        serverRevision
        schemaVersion
      }
      conflict
      currentServerRevision
      acceptedLocalRevision
    }
  }
`;

export const GET_PAGE = gql`
  query GetPage($id: ID!) {
    page(id: $id) {
      id
      title
      isPublished
      blocks {
        id
        type
        x
        y
        width
        height
        content
        ${BLOCK_STYLE_FRAGMENT}
        ${BLOCK_EFFECTS_FRAGMENT}
      }
      ${BACKGROUND_FRAGMENT}
      createdAt
      updatedAt
      serverRevision
      schemaVersion
    }
  }
`;

export const PUBLISH_PAGE = gql`
  mutation PublishPage($id: ID!) {
    publishPage(id: $id) {
      id
      isPublished
    }
  }
`;

export const GET_PUBLIC_PAGE = gql`
  query GetPublicPage($id: ID!) {
    publicPage(id: $id) {
      id
      title
      isPublished
      owner {
        id
        displayName
      }
      blocks {
        id
        type
        x
        y
        width
        height
        content
        ${BLOCK_STYLE_FRAGMENT}
        ${BLOCK_EFFECTS_FRAGMENT}
      }
      ${BACKGROUND_FRAGMENT}
      createdAt
    }
    me {
      id
    }
  }
`;

export const FORK_PAGE = gql`
  mutation ForkPage($id: ID!) {
    forkPage(id: $id) {
      id
      title
    }
  }
`;

export const REQUEST_MAGIC_LINK = gql`
  mutation RequestMagicLink($email: String!) {
    requestMagicLink(email: $email) {
      success
      message
    }
  }
`;

export const SEND_FEEDBACK = gql`
  mutation SendFeedback($pageId: ID!, $message: String!, $email: String) {
    sendFeedback(pageId: $pageId, message: $message, email: $email) {
      success
      message
    }
  }
`;
