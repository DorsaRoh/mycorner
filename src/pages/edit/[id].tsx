import { useRouter } from 'next/router';
import Head from 'next/head';
import { useQuery } from '@apollo/client';
import { GET_PAGE } from '@/lib/graphql/mutations';
import { Editor } from '@/components/editor';
import styles from '@/styles/EditPage.module.css';

export default function EditPage() {
  const router = useRouter();
  const { id } = router.query;

  const { data, loading, error } = useQuery(GET_PAGE, {
    variables: { id },
    skip: !id,
  });

  if (loading || !id) {
    return (
      <div className={styles.loading}>
        <span>Loading...</span>
      </div>
    );
  }

  if (error || !data?.page) {
    return (
      <div className={styles.error}>
        <h1>Page not found</h1>
        <p>This page doesn&apos;t exist or you don&apos;t have access to it.</p>
        <button onClick={() => router.push('/')} className={styles.backBtn}>
          Go home
        </button>
      </div>
    );
  }

  const { page } = data;

  return (
    <>
      <Head>
        <title>{page.title || 'Untitled'} – my corner</title>
      </Head>
      <Editor
        pageId={page.id}
        initialBlocks={page.blocks}
        initialTitle={page.title}
        initialBackground={page.background}
        initialPublished={page.isPublished}
      />
    </>
  );
}

