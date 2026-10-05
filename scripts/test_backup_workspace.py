"""Test backup publication and cleanup without connecting to a database."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().with_name('backup_workspace.sh')


class BackupTests(unittest.TestCase):
    def run_backup(self, mode):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        docker = root / 'docker'
        docker.write_text('''#!/bin/sh
case "$*" in
  *pg_dump*)
    case "$BACKUP_TEST_MODE" in
      fail) printf partial; exit 2;;
      empty) exit 0;;
      *) printf 'PGDMP test archive';;
    esac;;
  *pg_restore*)
    cat >/dev/null
    test "$BACKUP_TEST_MODE" != invalid;;
  *) exit 3;;
esac
''')
        docker.chmod(0o700)
        target = root / 'backup directory'
        env = {**os.environ, 'PATH': f'{root}:{os.environ["PATH"]}', 'BACKUP_TEST_MODE': mode}
        result = subprocess.run(['sh', str(SCRIPT), str(target)], cwd=root, env=env, capture_output=True, text=True)
        return result, target

    def test_valid_dump_is_private_and_published(self):
        result, target = self.run_backup('ok')
        self.assertEqual(result.returncode, 0, result.stderr)
        files = list(target.iterdir())
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0].suffix, '.dump')
        self.assertEqual(files[0].stat().st_mode & 0o777, 0o600)

    def test_failed_empty_and_invalid_dumps_are_not_published(self):
        for mode in ('fail', 'empty', 'invalid'):
            with self.subTest(mode=mode):
                result, target = self.run_backup(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(list(target.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
