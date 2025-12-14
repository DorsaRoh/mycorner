import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useMutation, useQuery, gql } from '@apollo/client';
import { CREATE_PAGE } from '@/lib/graphql/mutations';
import styles from '@/styles/Home.module.css';

const ME_QUERY = gql`
  query Me {
    me {
      id
      email
    }
  }
`;

export default function Home() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  
  const { data: meData } = useQuery(ME_QUERY);
  const [createPage] = useMutation(CREATE_PAGE);

  const handleCreatePage = async () => {
    setCreating(true);
    try {
      const { data } = await createPage({
        variables: { input: {} },
      });
      if (data?.createPage?.id) {
        router.push(`/edit/${data.createPage.id}`);
      }
    } catch (error) {
      console.error('Failed to create page:', error);
      setCreating(false);
    }
  };

  return (
    <>
      <Head>
        <title>my corner</title>
        <meta name="description" content="Your personal internet page" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.title}>my corner</h1>
          <p className={styles.subtitle}>your personal internet page</p>
          
          <button
            className={styles.createBtn}
            onClick={handleCreatePage}
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create your page'}
          </button>

          {meData?.me && (
            <p className={styles.userInfo}>
              Signed in as {meData.me.email}
            </p>
          )}
        </div>
      </main>
    </>
  );
}
